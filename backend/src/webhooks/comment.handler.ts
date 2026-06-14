import { prisma } from '../lib/prisma.js'
import { redis } from '../lib/redis.js'
import { postCommentReply, postIgCommentReply, sendPrivateReply } from '../services/meta.service.js'
import { decrypt } from '../services/crypto.service.js'
import { ConversationStatus, ChannelType } from '@prisma/client'
import pino from 'pino'

const logger = pino()
const COMMENT_DEDUP_TTL = 86400 // 24 hours
const OLD_POST_DAYS = 30

interface FbComment {
  comment_id: string
  post_id?: string
  from: { id: string; name?: string }
  message: string
  created_time?: number
}

interface IgComment {
  id: string
  text: string
  from: { id: string; username?: string }
  media: { id: string }
}

export async function handleFbComment(tenantId: string, pageId: string, value: FbComment): Promise<void> {
  const channel = await prisma.tenantChannel.findFirst({
    where: { tenantId, channelId: pageId, channelType: 'facebook_page', isActive: true },
  })
  if (!channel) return

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant?.commentAutoReplyEnabled) return

  // Skip the account replying to itself (its own comment/reply)
  if (value.from.id === pageId) return

  // Skip old posts
  if (value.created_time) {
    const ageMs = Date.now() - value.created_time * 1000
    if (ageMs > OLD_POST_DAYS * 24 * 60 * 60 * 1000) return
  }

  const dedupKey = `comment_replied:${value.from.id}:${value.post_id || value.comment_id}`
  const alreadyReplied = await redis.get(dedupKey)
  if (alreadyReplied) return

  const accessToken = decrypt(channel.accessToken)

  try {
    // 1. Public comment reply
    await postCommentReply(value.comment_id, tenant.commentAutoReplyText, accessToken)

    // 2. Send DM via private reply (works without an open messaging window)
    await sendPrivateReply(channel, value.comment_id, tenant.commentDmOpenerText)

    // 3. Mark dedup
    await redis.set(dedupKey, '1', 'EX', COMMENT_DEDUP_TTL)

    // 4. Create/update conversation
    await prisma.conversation.upsert({
      where: {
        tenantId_channelType_contactIdentifier: {
          tenantId,
          channelType: ChannelType.facebook_page,
          contactIdentifier: value.from.id,
        },
      },
      create: {
        tenantId,
        channelId: channel.id,
        channelType: ChannelType.facebook_page,
        contactIdentifier: value.from.id,
        contactName: value.from.name,
        status: ConversationStatus.ai_active,
        source: 'comment_funnel',
        triggerPostId: value.post_id,
      },
      update: {
        source: 'comment_funnel',
        triggerPostId: value.post_id,
      },
    })
  } catch (err) {
    logger.error({ err, tenantId, commentId: value.comment_id }, 'Comment funnel failed')
  }
}

export async function handleIgComment(
  tenantId: string,
  igAccountId: string,
  value: IgComment
): Promise<void> {
  const channel = await prisma.tenantChannel.findFirst({
    where: { tenantId, channelId: igAccountId, channelType: 'instagram', isActive: true },
  })
  if (!channel) return

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant?.commentAutoReplyEnabled) return

  // Skip the IG business account replying to itself
  if (value.from.id === igAccountId) return

  const dedupKey = `comment_replied:${value.from.id}:${value.media.id}`
  const alreadyReplied = await redis.get(dedupKey)
  if (alreadyReplied) return

  const accessToken = decrypt(channel.accessToken)

  try {
    // 1. Public reply under the comment (best-effort — requires
    //    instagram_manage_comments; don't let a failure block the DM).
    try {
      await postIgCommentReply(value.id, tenant.commentAutoReplyText, accessToken)
    } catch (replyErr) {
      logger.warn({ replyErr, tenantId, commentId: value.id }, 'IG public comment reply failed')
    }

    // 2. Send DM via private reply to the comment (works without an open
    //    messaging window — the correct comment→DM mechanism for fresh commenters)
    await sendPrivateReply(channel, value.id, tenant.commentDmOpenerText)

    await redis.set(dedupKey, '1', 'EX', COMMENT_DEDUP_TTL)

    await prisma.conversation.upsert({
      where: {
        tenantId_channelType_contactIdentifier: {
          tenantId,
          channelType: ChannelType.instagram,
          contactIdentifier: value.from.id,
        },
      },
      create: {
        tenantId,
        channelId: channel.id,
        channelType: ChannelType.instagram,
        contactIdentifier: value.from.id,
        contactName: value.from.username,
        status: ConversationStatus.ai_active,
        source: 'comment_funnel',
        triggerPostId: value.media.id,
      },
      update: {
        source: 'comment_funnel',
        triggerPostId: value.media.id,
      },
    })
  } catch (err) {
    logger.error({ err, tenantId }, 'IG comment funnel failed')
  }
}
