import { decrypt } from './crypto.service.js'
import { TenantChannel, ChannelType } from '@prisma/client'
import pino from 'pino'

const logger = pino()
const GRAPH_API = 'https://graph.facebook.com/v22.0'

export async function sendTypingAction(
  channel: TenantChannel,
  recipientId: string,
  action: 'typing_on' | 'typing_off'
): Promise<void> {
  const accessToken = decrypt(channel.accessToken)
  await fetch(`${GRAPH_API}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      recipient: { id: recipientId },
      sender_action: action,
    }),
  }).catch(() => {})
}

export async function sendMessage(
  channel: TenantChannel,
  recipientId: string,
  text: string
): Promise<void> {
  const accessToken = decrypt(channel.accessToken)

  const res = await fetch(`${GRAPH_API}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      recipient: { id: recipientId },
      message: { text },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta send message failed: ${res.status} ${body}`)
  }
}

// Private Reply: the correct way to open a DM in response to a comment. Unlike
// recipient:{id} (which requires an already-open 24h messaging window), this
// targets recipient:{comment_id}, so it works for a fresh commenter who has
// never DMed the page. Gated on instagram_manage_comments + pages_messaging.
// Works for both FB (value.comment_id) and IG (value.id) via /me/messages.
export async function sendPrivateReply(
  channel: TenantChannel,
  commentId: string,
  text: string
): Promise<void> {
  const accessToken = decrypt(channel.accessToken)

  const res = await fetch(`${GRAPH_API}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      recipient: { comment_id: commentId },
      message: { text },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Private reply failed: ${res.status} ${body}`)
  }
}

export async function postCommentReply(
  commentId: string,
  message: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Meta comment reply failed: ${res.status} ${body}`)
  }
}

// Instagram comments use a different endpoint than Facebook: a public reply is
// posted to /{ig-comment-id}/replies (requires instagram_manage_comments).
export async function postIgCommentReply(
  commentId: string,
  message: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`IG comment reply failed: ${res.status} ${body}`)
  }
}

export async function exchangeForLongLivedToken(
  shortToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  })

  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`)
  if (!res.ok) throw new Error('Token exchange failed')

  const data = (await res.json()) as { access_token: string; expires_in: number }
  return { accessToken: data.access_token, expiresIn: data.expires_in }
}

export async function getPageAccessToken(
  userToken: string,
  pageId: string
): Promise<{ accessToken: string; name: string }> {
  const res = await fetch(
    `${GRAPH_API}/${pageId}?fields=name,access_token&access_token=${userToken}`
  )
  if (!res.ok) throw new Error('Failed to get page access token')

  const data = (await res.json()) as { access_token: string; name: string }
  return { accessToken: data.access_token, name: data.name }
}

export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string,
  fields: string[]
): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${pageId}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: pageAccessToken,
      subscribed_fields: fields,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Webhook subscription failed: ${body}`)
  }
}

export async function getUserProfile(
  userId: string,
  accessToken: string,
  channelType: ChannelType
): Promise<string | null> {
  try {
    const fields = channelType === ChannelType.instagram ? 'name,username' : 'first_name,last_name'
    const res = await fetch(`${GRAPH_API}/${userId}?fields=${fields}&access_token=${accessToken}`)
    if (!res.ok) {
      logger.warn({ userId, channelType, status: res.status, body: await res.text() }, 'getUserProfile request failed')
      return null
    }

    const data = (await res.json()) as { first_name?: string; last_name?: string; name?: string; username?: string }
    if (channelType === ChannelType.instagram) {
      return data.name || data.username || null
    }
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
    return name || null
  } catch (err) {
    logger.warn({ err, userId, channelType }, 'getUserProfile threw')
    return null
  }
}

export async function getInstagramAccountId(pageId: string, pageAccessToken: string): Promise<string> {
  const res = await fetch(
    `${GRAPH_API}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
  )
  if (!res.ok) throw new Error('Failed to get IG account')

  const data = (await res.json()) as { instagram_business_account?: { id: string } }
  if (!data.instagram_business_account?.id) {
    throw new Error('No Instagram Business Account linked to this page')
  }
  return data.instagram_business_account.id
}
