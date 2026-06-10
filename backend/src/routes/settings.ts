import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'
import { encrypt, decrypt } from '../services/crypto.service.js'
import { resolveTextModelId, resolveVisionModelId } from '../config/model-pricing.js'

const router = Router()
router.use(requireAuth, tenantScope)

const personaSchema = z.object({
  aiPersona: z.string(),
  timezone: z.string().optional(),
  commentAutoReplyEnabled: z.boolean().optional(),
  commentAutoReplyText: z.string().optional(),
  commentDmOpenerText: z.string().optional(),
})

const modelSchema = z.object({
  textModel: z.string().optional(),
  visionModel: z.string().optional(),
  sttModel: z.string().optional(),
})

const apiKeysSchema = z.object({
  openaiKey: z.string().optional().nullable(),
  geminiKey: z.string().optional().nullable(),
  xaiKey: z.string().optional().nullable(),
})

function getTenantId(req: Request): string {
  return req.tenantScope === 'ALL' ? (req.query.tenantId as string) : req.tenantScope
}

router.get('/', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  if (!tenantId) {
    res.status(400).json({ error: 'tenantId is required' })
    return
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      aiPersona: true,
      timezone: true,
      industry: true,
      textModel: true,
      visionModel: true,
      sttModel: true,
      commentAutoReplyEnabled: true,
      commentAutoReplyText: true,
      commentDmOpenerText: true,
      status: true,
    },
  })
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' })
    return
  }
  res.json({
    ...tenant,
    textModel: resolveTextModelId(tenant.textModel),
    visionModel: resolveVisionModelId(tenant.visionModel),
  })
})

router.patch('/persona', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const parsed = personaSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: parsed.data,
  })
  res.json(tenant)
})

router.patch('/models', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const parsed = modelSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: parsed.data,
  })
  res.json(tenant)
})

router.get('/api-keys', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const keys = await prisma.tenantApiKeys.findUnique({ where: { tenantId } })
  if (!keys) {
    res.json({ openaiKey: null, geminiKey: null, xaiKey: null })
    return
  }

  // Return masked values
  res.json({
    openaiKey: keys.openaiKey ? maskKey(decrypt(keys.openaiKey)) : null,
    geminiKey: keys.geminiKey ? maskKey(decrypt(keys.geminiKey)) : null,
    xaiKey: keys.xaiKey ? maskKey(decrypt(keys.xaiKey)) : null,
    updatedAt: keys.updatedAt,
  })
})

router.put('/api-keys', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const parsed = apiKeysSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const data: Record<string, string | null> = {}
  if (parsed.data.openaiKey !== undefined) {
    data.openaiKey = parsed.data.openaiKey ? encrypt(parsed.data.openaiKey) : null
  }
  if (parsed.data.geminiKey !== undefined) {
    data.geminiKey = parsed.data.geminiKey ? encrypt(parsed.data.geminiKey) : null
  }
  if (parsed.data.xaiKey !== undefined) {
    data.xaiKey = parsed.data.xaiKey ? encrypt(parsed.data.xaiKey) : null
  }

  await prisma.tenantApiKeys.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  })

  res.json({ success: true })
})

function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

export default router
