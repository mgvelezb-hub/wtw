import { describe, it, expect, afterEach } from 'vitest'
import { GET } from '@/app/sw.js/route'

const ORIGINAL_SHA = process.env.VERCEL_GIT_COMMIT_SHA

afterEach(() => {
  process.env.VERCEL_GIT_COMMIT_SHA = ORIGINAL_SHA
})

describe('GET /sw.js', () => {
  it('el nombre del cache cambia entre deploys distintos', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc123'
    const bodyA = await (await GET()).text()

    process.env.VERCEL_GIT_COMMIT_SHA = 'def456'
    const bodyB = await (await GET()).text()

    expect(bodyA).toContain("const CACHE = 'wtw-shell-abc123'")
    expect(bodyB).toContain("const CACHE = 'wtw-shell-def456'")
    expect(bodyA).not.toBe(bodyB)
  })

  it('responde con Content-Type de JavaScript', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('application/javascript')
  })
})
