import { prisma } from '../lib/prisma.js'
import { appendToBuffer, BufferedMessage } from '../services/buffer.service.js'
import { ConversationStatus, ChannelType } from '@prisma/client'
import { emitToTenant } from '../socket/index.js'
import { decrypt } from '../services/crypto.service.js'
import { getUserProfile } from '../services/meta.service.js'
import pino from 'pino'

const logger = pino()

interface MessagingEntry {
  sender: { id: string }
  recipient: { id: string }
  timestamp: number
  message?: {
    mid: string
    text?: string
    attachments?: Array<{
      type: 'audio' | 'image' | 'video' | 'file'
      payload: { url: string }
    }>
  }
}

export async function handleMessage(
  tenantId: string,
  channelId: string,
  channelType: ChannelType,
  entry: MessagingEntry
): Promise<void> {
  const { sender, message } = entry
  if (!message) return

  // Find or create conversation
  let conversation = await prisma.conversation.findUnique({
    where: {
      tenantId_channelType_contactIdentifier: {
        tenantId,
        channelType,
        contactIdentifier: sender.id,
      },
    },
  })

  if (!conversation) {
    const channel = await prisma.tenantChannel.findFirst({
      where: { tenantId, channelId, isActive: true },
    })

    let contactName: string | null = null
    if (channel) {
      contactName = await getUserProfile(sender.id, decrypt(channel.accessToken), channelType)
    }

    conversation = await prisma.conversation.create({
      data: {
        tenantId,
        channelId: channel?.id,
        channelType,
        contactIdentifier: sender.id,
        contactName,
        status: ConversationStatus.ai_active,
      },
    })
  } else if (!conversation.contactName) {
    const channel = await prisma.tenantChannel.findFirst({
      where: { tenantId, channelId, isActive: true },
    })
    if (channel) {
      const name = await getUserProfile(sender.id, decrypt(channel.accessToken), channelType)
      if (name) {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: { contactName: name },
        })
      }
    }
  }

  // Save incoming message
  const text = message.text || ''
  const attachment = message.attachments?.[0]
  const mediaUrl = attachment?.payload.url
  const mediaType = attachment?.type === 'audio' ? 'audio' : attachment?.type === 'image' ? 'image' : undefined

  const savedMsg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      
      content: text || `[${attachment?.type || 'attachment'}]`,
      mediaUrl,
      mediaType,
      sentBy: 'customer',
    },
  })

  // Emit to dashboard
  emitToTenant(tenantId, 'new_message', {
    conversationId: conversation.id,
    message: savedMsg,
  })

  // If human is active, skip AI — forward to dashboard only
  if (
    conversation.status === ConversationStatus.human_active ||
    conversation.status === ConversationStatus.awaiting_human
  ) {
    logger.info({ conversationId: conversation.id }, 'Human active — skipping AI buffer')
    return
  }

  // Buffer for AI processing
  const buffered: BufferedMessage = {
    messageId: message.mid,
    text,
    mediaUrl,
    mediaType: mediaType as BufferedMessage['mediaType'],
    timestamp: Date.now(),
  }

  const channel = await prisma.tenantChannel.findFirst({
    where: { tenantId, channelId, isActive: true },
  })

  await appendToBuffer(tenantId, sender.id, buffered, conversation.id, channel?.id || '')
}
