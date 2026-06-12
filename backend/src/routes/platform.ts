import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js'
import { encrypt, decrypt } from '../services/crypto.service.js'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

const PLATFORM_ID = 'global'

const apiKeysSchema = z.object({
  openaiKey: z.string().optional().nullable(),
  geminiKey: z.string().optional().nullable(),
  xaiKey: z.string().optional().nullable(),
  sonorKey: z.string().optional().nullable(),
})

router.get('/api-keys', async (_req: Request, res: Response) => {
  const keys = await prisma.platformApiKeys.findUnique({ where: { id: PLATFORM_ID } })
  if (!keys) {
    res.json({ openaiKey: null, geminiKey: null, xaiKey: null, sonorKey: null })
    return
  }

  res.json({
    openaiKey: keys.openaiKey ? maskKey(decrypt(keys.openaiKey)) : null,
    geminiKey: keys.geminiKey ? maskKey(decrypt(keys.geminiKey)) : null,
    xaiKey: keys.xaiKey ? maskKey(decrypt(keys.xaiKey)) : null,
    sonorKey: keys.sonorKey ? maskKey(decrypt(keys.sonorKey)) : null,
    updatedAt: keys.updatedAt,
  })
})

router.put('/api-keys', async (req: Request, res: Response) => {
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
  if (parsed.data.sonorKey !== undefined) {
    data.sonorKey = parsed.data.sonorKey ? encrypt(parsed.data.sonorKey) : null
  }

  await prisma.platformApiKeys.upsert({
    where: { id: PLATFORM_ID },
    create: { id: PLATFORM_ID, ...data },
    update: data,
  })

  res.json({ success: true })
})

function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

export default router
