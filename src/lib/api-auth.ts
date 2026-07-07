import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { User } from '@prisma/client'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return 'wtw_' + randomBytes(24).toString('base64url')
}

export async function apiUser(req: Request): Promise<User | null> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7)
  if (!token) return null
  return prisma.user.findUnique({ where: { apiTokenHash: hashToken(token) } })
}
