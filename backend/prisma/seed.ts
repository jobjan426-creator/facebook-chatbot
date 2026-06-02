import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL
  const password = process.env.SUPER_ADMIN_PASSWORD

  if (!email || !password) {
    console.log('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set — skipping seed')
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Super-admin ${email} already exists`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.super_admin,
      isActive: true,
    },
  })

  console.log(`✅ Super-admin created: ${email}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
