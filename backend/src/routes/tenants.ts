import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js'
import { TenantStatus, UserRole } from '@prisma/client'

const router = Router()
router.use(requireAuth, requireSuperAdmin)

const createTenantSchema = z.object({
  name: z.string().min(1),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
  timezone: z.string().default('Asia/Ulaanbaatar'),
  industry: z.string().optional(),
})

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  industry: z.string().optional(),
})

router.get('/', async (_req: Request, res: Response) => {
  const tenants = await prisma.tenant.findMany({
    include: {
      owner: { select: { id: true, email: true, lastLoginAt: true } },
      channels: { select: { channelType: true, isActive: true } },
      _count: { select: { conversations: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(tenants)
})

router.get('/:id', async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, email: true, forcePasswordChange: true } },
      channels: true,
      apiKeys: {
        select: {
          openaiKey: true,
          geminiKey: true,
          xaiKey: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' })
    return
  }
  res.json(tenant)
})

router.post('/', async (req: Request, res: Response) => {
  const parsed = createTenantSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { name, ownerEmail, ownerPassword, timezone, industry } = parsed.data

  const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } })
  if (existingUser) {
    res.status(409).json({ error: 'Email already in use' })
    return
  }

  const passwordHash = await bcrypt.hash(ownerPassword, 12)

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        role: UserRole.tenant_admin,
        forcePasswordChange: true,
      },
    })

    const tenant = await tx.tenant.create({
      data: {
        name,
        ownerUserId: user.id,
        timezone,
        industry,
        status: TenantStatus.pending_setup,
      },
    })

    return { user, tenant }
  })

  res.status(201).json(result)
})

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateTenantSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const tenant = await prisma.tenant.update({
    where: { id: req.params.id },
    data: parsed.data,
  })
  res.json(tenant)
})

router.post('/:id/suspend', async (req: Request, res: Response) => {
  const { reason } = req.body
  const tenant = await prisma.tenant.update({
    where: { id: req.params.id },
    data: {
      status: TenantStatus.suspended,
      suspendedAt: new Date(),
      suspendedReason: reason || 'Suspended by admin',
    },
  })
  res.json(tenant)
})

router.post('/:id/activate', async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } })
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' })
    return
  }

  const updated = await prisma.tenant.update({
    where: { id: req.params.id },
    data: {
      status: TenantStatus.active,
      suspendedAt: null,
      suspendedReason: null,
    },
  })
  res.json(updated)
})

router.delete('/:id', async (req: Request, res: Response) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } })
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' })
    return
  }
  await prisma.tenant.delete({ where: { id: req.params.id } })
  await prisma.user.delete({ where: { id: tenant.ownerUserId } })
  res.status(204).send()
})

// Admin: remove leftover owner accounts left behind by tenant deletions
// performed before the fix above (users with role tenant_admin and no tenant)
router.post('/cleanup-orphan-users', async (_req: Request, res: Response) => {
  const orphans = await prisma.user.findMany({
    where: { role: UserRole.tenant_admin, tenant: null },
    select: { id: true, email: true },
  })
  await prisma.user.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } })
  res.json({ deleted: orphans.map((o) => o.email) })
})

export default router
