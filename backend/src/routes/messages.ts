import { Router, Request, Response } from 'express'
import { z } from 'zod'
import fetch from 'node-fetch'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'
import { sendMessage } from '../services/meta.service.js'
import { emitToTenant } from '../socket/index.js'
import { ConversationStatus } from '@prisma/client'

const router = Router()
router.use(requireAuth, tenantScope)

// Allowed Meta CDN hosts for media proxying — prevents this from becoming an open proxy (SSRF)
const ALLOWED_MEDIA_HOSTS = /(^|\.)(fbcdn\.net|fbsbx\.com|cdninstagram\.com)$/i

// Proxies customer-sent audio/image attachments from Meta's CDN so the browser
// can play/view them without hitting CORS or hotlink-protection issues.
router.get('/media-proxy', async (req: Request, res: Response) => {
  const url = req.query.url as string | undefined
  if (!url) {
    res.status(400).json({ error: 'url required' })
    return
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    res.status(400).json({ error: 'Invalid url' })
    return
  }

  if (!ALLOWED_MEDIA_HOSTS.test(parsed.hostname)) {
    res.status(400).json({ error: 'Host not allowed' })
    return
  }

  const upstream = await fetch(url)
  if (!upstream.ok) {
    res.status(upstream.status).json({ error: 'Failed to fetch media' })
    return
  }

  const contentType = upstream.headers.get('content-type')
  const contentLength = upstream.headers.get('content-length')
  if (contentType) res.setHeader('Content-Type', contentType)
  if (contentLength) res.setHeader('Content-Length', contentLength)
  res.setHeader('Cache-Control', 'private, max-age=3600')

  if (!upstream.body) {
    res.status(502).json({ error: 'No media body' })
    return
  }
  upstream.body.pipe(res)
})

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(2000),
})

router.get('/', async (req: Request, res: Response) => {
  const { conversationId, limit = '50', offset = '0' } = req.query as Record<string, string>

  if (!conversationId) {
    res.status(400).json({ error: 'conversationId required' })
    return
  }

  const where: Record<string, unknown> = { conversationId }
  if (req.tenantScope !== 'ALL') where.conversation = { tenantId: req.tenantScope }

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: Number(limit),
    skip: Number(offset),
  })

  res.json(messages)
})

router.post('/', async (req: Request, res: Response) => {
  const parsed = sendSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const { conversationId, text } = parsed.data

  const where: Record<string, unknown> = { id: conversationId }
  if (req.tenantScope !== 'ALL') where.tenantId = req.tenantScope

  const conversation = await prisma.conversation.findFirst({
    where,
    include: { channel: true },
  })

  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }

  if (!conversation.channel) {
    res.status(400).json({ error: 'Conversation has no channel' })
    return
  }

  // Send via Meta API
  await sendMessage(conversation.channel, conversation.contactIdentifier, text)

  // Save operator message
  const savedMsg = await prisma.message.create({
    data: {
      conversationId,
      
      content: text,
      sentBy: req.user.userId,
    },
  })

  // Update conversation: mark human active, update timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: ConversationStatus.human_active,
      assignedOperatorId: req.user.userId,
      lastHumanActivityAt: new Date(),
    },
  })

  emitToTenant(conversation.tenantId, 'new_message', {
    conversationId,
    message: savedMsg,
  })

  res.status(201).json(savedMsg)
})

export default router
