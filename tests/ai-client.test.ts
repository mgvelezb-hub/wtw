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
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45, thinkingTokens: 0 })
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

  it('pide 8000 tokens por default — el razonamiento del modelo consume el mismo presupuesto', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.resetModules()

    const createSpy = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    })
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = { create: createSpy }
      },
    }))

    const { callModel } = await import('@/lib/ai/client')
    const user = await seedUser()

    await callModel({
      userId: user.id,
      feature: 'planear_wins',
      model: 'claude-sonnet-5',
      system: 'x',
      messages: [{ role: 'user', content: 'y' }],
    })

    expect(createSpy.mock.calls[0][0].max_tokens).toBe(8000)
  })

  it('devuelve stopReason y los tokens de razonamiento', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.resetModules()

    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 10, output_tokens: 500, output_tokens_details: { thinking_tokens: 400 } },
            stop_reason: 'end_turn',
          }),
        }
      },
    }))

    const { callModel } = await import('@/lib/ai/client')
    const user = await seedUser()

    const r = await callModel({
      userId: user.id,
      feature: 'planear_wins',
      model: 'claude-sonnet-5',
      system: 'x',
      messages: [{ role: 'user', content: 'y' }],
    })

    expect(r.stopReason).toBe('end_turn')
    expect(r.usage.thinkingTokens).toBe(400)
  })

  // El bug del 2026-08-24: sugerirWinsAction reportó "la IA respondió en un
  // formato que no pude leer" cuando en realidad el razonamiento se comió 1446
  // de 2000 tokens y el JSON llegó cortado a media entrada. Truncado y mal
  // formateado son fallas distintas y tienen que reportarse distinto: reintentar
  // un truncado vuelve a truncar.
  it('lanza un error honesto —no devuelve texto a medias— cuando la respuesta se corta por max_tokens', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.resetModules()

    vi.doMock('@anthropic-ai/sdk', () => ({
      default: class {
        messages = {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: '[{"titulo":"a medio corta' }],
            usage: { input_tokens: 1328, output_tokens: 2000, output_tokens_details: { thinking_tokens: 1446 } },
            stop_reason: 'max_tokens',
          }),
        }
      },
    }))

    const { callModel } = await import('@/lib/ai/client')
    const user = await seedUser()

    await expect(
      callModel({
        userId: user.id,
        feature: 'planear_wins',
        model: 'claude-sonnet-5',
        system: 'x',
        messages: [{ role: 'user', content: 'y' }],
      })
    ).rejects.toThrow(/se cort/i)

    // La llamada truncada igual se registra: sin la fila no hay forma de ver
    // después que el presupuesto quedó corto.
    const calls = await prisma.aiCall.findMany({ where: { userId: user.id } })
    expect(calls).toHaveLength(1)
    expect(calls[0].outputTokens).toBe(2000)
  })
})
