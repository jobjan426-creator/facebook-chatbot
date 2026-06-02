import { Request, Response, NextFunction } from 'express'

export function tenantScope(req: Request, res: Response, next: NextFunction): void {
  if (req.user.role === 'super_admin') {
    req.tenantScope = (req.query.tenantId as string) || 'ALL'
  } else {
    if (!req.user.tenantId) {
      res.status(403).json({ error: 'No tenant associated with this account' })
      return
    }
    req.tenantScope = req.user.tenantId
  }
  next()
}
