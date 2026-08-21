import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { metricasAceptacion } from '@/lib/ai/metricas'

const TEST_EMAIL = 'test-ai-metricas@vp.mx'
const OTHER_EMAIL = 'test-ai-metricas-other@vp.mx'

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTHER_EMAIL)
})
afterEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTHER_EMAIL)
})

async function seedUser(email = TEST_EMAIL) {
  return prisma.user.create({ data: { email, nombre: 'Test', passwordHash: 'x' } })
}

async function crearAiCall(userId: string, feature: string) {
  return prisma.aiCall.create({
    data: { userId, feature, modelo: 'claude-sonnet-5', inputTokens: 100, outputTokens: 50, ms: 500 },
  })
}

async function crearArtifact(userId: string, tipo: 'status_equipo' | 'resumen_minuta', borrador: string, final: string | null) {
  return prisma.artifact.create({
    data: {
      userId,
      tipo,
      insumos: {},
      borrador,
      final,
      estado: final === null ? 'borrador' : final === borrador ? 'enviado' : 'editado',
      modelo: 'claude-sonnet-5',
      promptVersion: 'v1',
    },
  })
}

describe('metricasAceptacion', () => {
  it('reporta solo el conteo de llamadas para una feature sin Artifact', async () => {
    const user = await seedUser()
    await crearAiCall(user.id, 'clasificar_minuta')
    await crearAiCall(user.id, 'clasificar_minuta')
    await crearAiCall(user.id, 'clasificar_minuta')

    const metricas = await metricasAceptacion(user.id)

    expect(metricas.clasificar_minuta).toEqual({ llamadas: 3, artifacts: null })
  })

  it('cuenta aceptados sin editar, editados y pendientes, y calcula el % sobre lo revisado', async () => {
    const user = await seedUser()
    for (let i = 0; i < 4; i++) await crearAiCall(user.id, 'status_equipo')

    // 1 aceptado tal cual, 2 editados, 1 todavía sin revisar (final null).
    await crearArtifact(user.id, 'status_equipo', 'texto A', 'texto A')
    await crearArtifact(user.id, 'status_equipo', 'texto B', 'texto B corregido')
    await crearArtifact(user.id, 'status_equipo', 'texto C', 'texto C corregido')
    await crearArtifact(user.id, 'status_equipo', 'texto D', null)

    const metricas = await metricasAceptacion(user.id)

    expect(metricas.status_equipo.llamadas).toBe(4)
    expect(metricas.status_equipo.artifacts).toEqual({
      total: 4,
      aceptadosSinEditar: 1,
      editados: 2,
      pendientes: 1,
      pctAceptacion: 33, // 1 de 3 revisados (el pendiente no cuenta), redondeado
    })
  })

  it('pctAceptacion es null cuando ningún artifact ha sido revisado todavía', async () => {
    const user = await seedUser()
    await crearAiCall(user.id, 'resumen_minuta')
    await crearArtifact(user.id, 'resumen_minuta', 'texto', null)

    const metricas = await metricasAceptacion(user.id)

    expect(metricas.resumen_minuta.artifacts).toEqual({
      total: 1,
      aceptadosSinEditar: 0,
      editados: 0,
      pendientes: 1,
      pctAceptacion: null,
    })
  })

  it('no mezcla datos de otro usuario', async () => {
    const user = await seedUser()
    const otro = await seedUser(OTHER_EMAIL)

    await crearAiCall(user.id, 'status_equipo')
    await crearArtifact(user.id, 'status_equipo', 'mio', 'mio')

    await crearAiCall(otro.id, 'status_equipo')
    await crearAiCall(otro.id, 'status_equipo')
    await crearArtifact(otro.id, 'status_equipo', 'ajeno', 'ajeno editado distinto')
    await crearArtifact(otro.id, 'status_equipo', 'ajeno2', null)

    const metricas = await metricasAceptacion(user.id)

    expect(metricas.status_equipo.llamadas).toBe(1)
    expect(metricas.status_equipo.artifacts).toEqual({
      total: 1,
      aceptadosSinEditar: 1,
      editados: 0,
      pendientes: 0,
      pctAceptacion: 100,
    })
  })

  it('devuelve objeto vacío si el usuario no tiene ninguna llamada', async () => {
    const user = await seedUser()
    const metricas = await metricasAceptacion(user.id)
    expect(metricas).toEqual({})
  })
})
