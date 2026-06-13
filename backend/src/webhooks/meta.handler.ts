import { Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { handleMessage } from './message.handler.js'
import { handleFbComment, handleIgComment } from './comment.handler.js'
import { ChannelType } from '@prisma/client'
import pino from 'pino'

const logger = pino()

export async function handleMetaWebhook(req: Request, res: Response): Promise<void> {
    // Acknowledge immediately
  res.status(200).send('EVENT_RECEIVED')

  const body = req.body as MetaWebhookPayload
    if (!body.entry) return

  logger.info({ object: body.object, entryCount: body.entry.length }, 'Webhook received')

  for (const entry of body.entry) {
        const channelId = entry.id

      logger.info({ channelId, object: body.object }, 'Processing webhook entry')

      // Find tenant by channel ID
      const channel = await prisma.tenantChannel.findFirst({
              where: { channelId, isActive: true },
              include: { tenant: true },
      })

      if (!channel) {
              // Log all channels to help debug
          const allChannels = await prisma.tenantChannel.findMany({
                    select: { channelId: true, channelType: true, isActive: true },
          })
              logger.warn({ channelId, allChannels }, 'No active channel found for webhook entry')
              continue
      }

      logger.info({ channelId, tenantId: channel.tenantId, tenantStatus: channel.tenant.status }, 'Channel found')

      // Check tenant is active
      if (channel.tenant.status !== 'active') {
              logger.warn({ tenantId: channel.tenantId, status: channel.tenant.status }, 'Tenant not active')
              continue
      }

      if (body.object === 'page') {
              // FB Page: DM messages
          if (entry.messaging) {
                    for (const msg of entry.messaging) {
                                if (!msg.message) continue
                                // Echo = the page's own outgoing message coming back as a
                                // webhook (sender is the page itself). Never reply to it.
                                const isEcho = msg.message.is_echo === true || msg.sender?.id === channelId
                                logger.info({ object: body.object, senderId: msg.sender?.id, recipientId: msg.recipient?.id, isEcho, mid: msg.message.mid }, 'Processing FB message')
                                if (isEcho) continue
                                await handleMessage(channel.tenantId, channelId, ChannelType.facebook_page, msg)
                    }
          }

          // FB Page: Comments (feed)
          if (entry.changes) {
                    for (const change of entry.changes) {
                                if (change.field === 'feed' && (change.value as Record<string, unknown>)?.item === 'comment') {
                                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  await handleFbComment(channel.tenantId, channelId, change.value as any)
                                }
                    }
          }
      } else if (body.object === 'instagram') {
              // Instagram: DM messages
          if (entry.messaging) {
                    for (const msg of entry.messaging) {
                                if (!msg.message) continue
                                // Echo = the IG business account's own outgoing message
                                // (sender is the business itself). Never reply to it —
                                // otherwise we try to message ourselves → "No matching user found".
                                const isEcho = msg.message.is_echo === true || msg.sender?.id === channelId
                                logger.info({ object: body.object, senderId: msg.sender?.id, recipientId: msg.recipient?.id, isEcho, mid: msg.message.mid }, 'Processing IG message')
                                if (isEcho) continue
                                await handleMessage(channel.tenantId, channelId, ChannelType.instagram, msg)
                    }
          }

          // Instagram: Comments
          if (entry.changes) {
                    for (const change of entry.changes) {
                                if (change.field === 'comments' && change.value) {
                                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  await handleIgComment(channel.tenantId, channelId, change.value as any)
                                }
                    }
          }
      }
  }
}

interface MetaWebhookPayload {
    object: 'page' | 'instagram'
    entry: Array<{
      id: string
      messaging?: Array<{
        sender: { id: string }
        recipient: { id: string }
        timestamp: number
        message?: {
          mid: string
          text?: string
          is_echo?: boolean
          attachments?: Array<{
            type: 'audio' | 'image' | 'video' | 'file'
            payload: { url: string }
          }>
        }
      }>
      changes?: Array<{
        field: string
        value: Record<string, unknown>
      }>
    }>
}
