import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'
import { ConversationStatus } from '@prisma/client'
import { emitToTenant } from '../socket/index.js'

const router = Router()
router.use(requireAuth, tenantScope)

const statusSchema = z.object({
  status: z.nativeEnum(ConversationStatus),
  handoffReason: z.string().optional(),
})

router.get('/', async (req: Request, res: Response) => {
  const where: Record<string, unknown> = {}

  if (req.tenantScope !== 'ALL') {
    where.tenantId = req.tenantScope
  } else if (req.query.tenantId) {
    where.tenantId = req.query.tenantId
  }

  if (req.query.status) {
    where.status = req.query.status as ConversationStatus
  }

  if (req.query.channel) {
    where.channelType = req.query.channel
  }

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, sentBy: true, createdAt: true, mediaType: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: Number(req.query.limit) || 50,
    skip: Number(req.query.offset) || 0,
  })

  res.json(conversations)
})

router.get('/:id', async (req: Request, res: Response) => {
  const where: Record<string, unknown> = { id: req.params.id }
  if (req.tenantScope !== 'ALL') where.tenantId = req.tenantScope

  const conv = await prisma.conversation.findFirst({ where })
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }
  res.json(conv)
})

router.patch('/:id/status', async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' })
    return
  }

  const where: Record<string, unknown> = { id: req.params.id }
  if (req.tenantScope !== 'ALL') where.tenantId = req.tenantScope

  const existing = await prisma.conversation.findFirst({ where })
  if (!existing) {
    res.status(404).json({ error: 'Conversation not found' })
    return
  }

  const data: Record<string, unknown> = { status: parsed.data.status }

  if (parsed.data.status === ConversationStatus.human_active) {
    data.assignedOperatorId = req.user.userId
    data.lastHumanActivityAt = new Date()
  } else if (parsed.data.status === ConversationStatus.ai_active) {
    data.assignedOperatorId = null
    data.handoffReason = null
  } else if (parsed.data.status === ConversationStatus.resolved) {
    data.assignedOperatorId = null
  }

  if (parsed.data.handoffReason) {
    data.handoffReason = parsed.data.handoffReason
  }

  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data,
  })

  emitToTenant(existing.tenantId, 'conversation_status_changed', {
    conversationId: existing.id,
    status: parsed.data.status,
  })

  res.json(updated)
})

export default router
