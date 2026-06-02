import { Request } from 'express'

export function qs(req: Request, key: string): string | undefined {
  const val = req.query[key]
  if (Array.isArray(val)) return val[0] as string
  if (typeof val === 'string') return val
  if (val && typeof val === 'object' && !Array.isArray(val)) return String(val)
  return undefined
}
