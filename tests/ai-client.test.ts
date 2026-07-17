import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-ai-client@vp.mx'

const originalApiKey = process.env.ANTHROPIC_API_KEY

beforeEach(() => deleteTestUser(TEST_EMAIL))
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = originalApiKey
  vi.restoreAllMocks()
  vi.resetModules()
})

async function seedUser() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
}

describe('callModel', () => {
  it('lanza un error claro si falta ANTHROPIC_API_KEY, sin llamar al SDK', async () => {
    delete process.env.ANTHROPIC_API_KEY
    vi.resetModules()

    const createSpy = vi.fn()
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: createSpy }
      },
    }))

    const { callModel } = await import('@/lib/ai/client')
    const user = await seedUser()

    await expect(
      callModel({
        userId: user.id,
        feature: 'status_equipo',
        model: 'claude-sonnet-5',
        system: 'test',
        messages: [{ role: 'user', content: 'hola' }],
      })
    ).rejects.toThrow('ANTHROPIC_API_KEY no configurada')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('con el SDK mockeado, devuelve text/usage y crea la fila AiCall', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.resetModules()

    const createSpy = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'borrador de status' }],
      usage: { input_tokens: 120, output_tokens: 45 },
    })
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: createSpy }
      },
    }))

    const { callModel } = await import('@/lib/ai/client')
    const user = await seedUser()

    const result = await callModel({
      userId: user.id,
      feature: 'status_equipo',
      model: 'claude-sonnet-5',
      system: 'eres un asistente',
      messages: [{ role: 'user', content: 'genera el status' }],
    })

    expect(result.text).toBe('borrador de status')
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45 })
    expect(createSpy).toHaveBeenCalledTimes(1)

    const calls = await prisma.aiCall.findMany({ where: { userId: user.id } })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      feature: 'status_equipo',
      modelo: 'claude-sonnet-5',
      inputTokens: 120,
      outputTokens: 45,
    })
    expect(calls[0].ms).toBeGreaterThanOrEqual(0)
  })
})
