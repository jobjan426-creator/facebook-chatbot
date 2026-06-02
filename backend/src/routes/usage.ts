import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'
import { tenantScope } from '../middleware/tenantScope.js'

const router = Router()
router.use(requireAuth, tenantScope)

function getTenantId(req: Request): string | undefined {
  if (req.tenantScope !== 'ALL') return req.tenantScope
  return req.query.tenantId as string | undefined
}

router.get('/summary', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const where: Record<string, unknown> = { timestamp: { gte: monthStart } }
  if (tenantId) where.tenantId = tenantId

  const logs = await prisma.aiUsageLog.findMany({ where })

  const byCategory: Record<string, { calls: number; cost: number }> = {}
  let totalCost = 0

  for (const log of logs) {
    const cat = log.category
    if (!byCategory[cat]) byCategory[cat] = { calls: 0, cost: 0 }
    byCategory[cat].calls += 1
    const cost = Number(log.estimatedCostUsd)
    byCategory[cat].cost += cost
    totalCost += cost
  }

  res.json({
    month: monthStart.toISOString().slice(0, 7),
    totalCostUsd: totalCost.toFixed(4),
    byCategory,
    totalCalls: logs.length,
  })
})

router.get('/daily', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req)
  const days = Number(req.query.days) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const where: Record<string, unknown> = { timestamp: { gte: since } }
  if (tenantId) where.tenantId = tenantId

  const logs = await prisma.aiUsageLog.findMany({ where, orderBy: { timestamp: 'asc' } })

  const byDay: Record<string, number> = {}
  for (const log of logs) {
    const day = log.timestamp.toISOString().slice(0, 10)
    byDay[day] = (byDay[day] || 0) + Number(log.estimatedCostUsd)
  }

  const series = Object.entries(byDay).map(([date, cost]) => ({ date, cost: Number(cost.toFixed(6)) }))
  res.json(series)
})

export default router
