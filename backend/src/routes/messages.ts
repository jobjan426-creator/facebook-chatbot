import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'
import { sendMessage } from '../services/meta.service.js'
import { emitToTenant } from '../socket/index.js'
import { ConversationStatus } from '@prisma/client'

const router = Router()
router.use(requireAuth, tenantScope)

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
  if (req.tenantScope !== 'ALL') where.tenantId = req.tenantScope

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
