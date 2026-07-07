import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-minimo-32-caracteres!!'
})

describe('session encrypt/decrypt', () => {
  it('roundtrip devuelve el userId', async () => {
    const { encrypt, decrypt } = await import('@/lib/session')
    const token = await encrypt({ userId: 'abc123' })
    const payload = await decrypt(token)
    expect(payload?.userId).toBe('abc123')
  })

  it('token inválido devuelve null', async () => {
    const { decrypt } = await import('@/lib/session')
    expect(await decrypt('garbage')).toBeNull()
    expect(await decrypt(undefined)).toBeNull()
  })
})
