import { describe, it, expect } from 'vitest'
import { hashToken, newToken } from '@/lib/api-auth'

describe('hashToken', () => {
  it('sha256 determinista en hex', () => {
    expect(hashToken('wtw_abc')).toBe(hashToken('wtw_abc'))
    expect(hashToken('wtw_abc')).toMatch(/^[a-f0-9]{64}$/)
    expect(hashToken('wtw_abc')).not.toBe(hashToken('wtw_abd'))
  })
})

describe('newToken', () => {
  it('genera tokens únicos con prefijo wtw_', () => {
    const t1 = newToken()
    const t2 = newToken()
    expect(t1).toMatch(/^wtw_[A-Za-z0-9_-]{20,}$/)
    expect(t1).not.toBe(t2)
  })
})
