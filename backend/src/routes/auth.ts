import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/index.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const changePasswordSchema = z.object({
  newPassword: z.string().min(8),
})

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() })
    return
  }

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  let tenantId: string | undefined
  if (user.role === 'tenant_admin') {
    const tenant = await prisma.tenant.findUnique({ where: { ownerUserId: user.id } })
    tenantId = tenant?.id
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role, tenantId },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId,
      forcePasswordChange: user.forcePasswordChange,
    },
  })
})

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, email: true, role: true, forcePasswordChange: true },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ ...user, tenantId: req.user.tenantId })
})

router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: req.user.userId },
    data: { passwordHash: hash, forcePasswordChange: false },
  })

  res.json({ success: true })
})

export default router
