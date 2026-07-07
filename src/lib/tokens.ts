import { createHash, randomBytes } from 'crypto'

export function newPortalToken(): string {
  return 'wtwp_' + randomBytes(24).toString('base64url')
}

export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
