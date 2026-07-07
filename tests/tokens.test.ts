import { describe, it, expect } from 'vitest'
import { hashPortalToken, newPortalToken } from '@/lib/tokens'

describe('tokens del portal', () => {
  it('newPortalToken genera tokens únicos con prefijo distinguible', () => {
    const a = newPortalToken()
    const b = newPortalToken()
    expect(a).toMatch(/^wtwp_[A-Za-z0-9_-]{20,}$/)
    expect(a).not.toBe(b)
  })
  it('hashPortalToken es determinista', () => {
    expect(hashPortalToken('x')).toBe(hashPortalToken('x'))
    expect(hashPortalToken('x')).not.toBe(hashPortalToken('y'))
  })
})
