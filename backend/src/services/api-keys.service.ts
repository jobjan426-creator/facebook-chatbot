import { prisma } from '../lib/prisma.js'
import { TenantApiKeys } from '@prisma/client'

// Returns a TenantApiKeys-shaped object whose encrypted key fields are the
// tenant's own value when set, otherwise the shared platform default. This is
// purely additive: a tenant that has its own key behaves exactly as before
// (its key wins), and if no platform keys are configured the result is
// identical to reading TenantApiKeys directly. Downstream code keeps doing
// `keys.geminiKey ? decrypt(keys.geminiKey) : undefined` unchanged.
export async function getEffectiveApiKeys(tenantId: string): Promise<TenantApiKeys | null> {
  const [tenantKeys, platform] = await Promise.all([
    prisma.tenantApiKeys.findUnique({ where: { tenantId } }),
    prisma.platformApiKeys.findUnique({ where: { id: 'global' } }),
  ])

  // Nothing anywhere — preserve the original null return.
  if (!tenantKeys && !platform) return null

  return {
    tenantId,
    openaiKey: tenantKeys?.openaiKey ?? platform?.openaiKey ?? null,
    geminiKey: tenantKeys?.geminiKey ?? platform?.geminiKey ?? null,
    xaiKey: tenantKeys?.xaiKey ?? platform?.xaiKey ?? null,
    sonorKey: tenantKeys?.sonorKey ?? platform?.sonorKey ?? null,
    updatedAt: tenantKeys?.updatedAt ?? platform?.updatedAt ?? new Date(),
  }
}
