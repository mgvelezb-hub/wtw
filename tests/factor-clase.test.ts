import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { factorPorClase } from '@/lib/factor-clase'
import type { TipoTrabajo } from '@prisma/client'

const TEST_EMAIL = 'test-factor-clase@vp.mx'
const OTRO_EMAIL = 'test-factor-clase-otro@vp.mx'

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function crearUsuario(email: string) {
  return prisma.user.create({ data: { email, nombre: 'T', passwordHash: 'x' } })
}

// Una tarea terminada con estimado y tiempo medido — la unidad de muestra del factor.
async function tareaMedida(userId: string, tipo: TipoTrabajo, estimadoMin: number, medidoMin: number) {
  const task = await prisma.task.create({
    data: { userId, titulo: `${tipo} ${estimadoMin}`, estatus: 'done', tipoTrabajo: tipo, estimadoMin },
  })
  await prisma.timeEntry.create({
    data: { userId, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: medidoMin * 60 },
  })
  return task
}

describe('factorPorClase', () => {
  it('calcula medido/planeado por tipo con 3 o más muestras', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    // 60+60+120 planeados = 240; 90+90+150 medidos = 330 → 1.375 → 1.4 a un decimal.
    await tareaMedida(user.id, 'deck', 60, 90)
    await tareaMedida(user.id, 'deck', 60, 90)
    await tareaMedida(user.id, 'deck', 120, 150)

    const factores = await factorPorClase(user.id)
    expect(factores.deck.muestras).toBe(3)
    expect(factores.deck.factor).toBe(1.4)
  })

  it('devuelve null con menos de 3 muestras — no inventa una corrección', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    await tareaMedida(user.id, 'junta', 30, 60)
    await tareaMedida(user.id, 'junta', 30, 60)

    const factores = await factorPorClase(user.id)
    expect(factores.junta.muestras).toBe(2)
    expect(factores.junta.factor).toBeNull()
  })

  it('devuelve las seis clases, con null en las que no tienen datos', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    const factores = await factorPorClase(user.id)
    expect(Object.keys(factores).sort()).toEqual(
      ['analisis', 'comunicacion', 'deck', 'gestion', 'junta', 'otro'].sort()
    )
    expect(factores.otro).toEqual({ factor: null, muestras: 0 })
  })

  it('ignora tareas terminadas sin tiempo medido — un cero sesgaría el factor a la baja', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    await tareaMedida(user.id, 'analisis', 60, 120)
    await tareaMedida(user.id, 'analisis', 60, 120)
    await tareaMedida(user.id, 'analisis', 60, 120)
    // Terminada, estimada, pero nunca cronometrada: no es una medición.
    await prisma.task.create({
      data: { userId: user.id, titulo: 'sin medir', estatus: 'done', tipoTrabajo: 'analisis', estimadoMin: 300 },
    })

    const factores = await factorPorClase(user.id)
    expect(factores.analisis.muestras).toBe(3)
    expect(factores.analisis.factor).toBe(2)
  })

  it('no se contamina con tareas de otro usuario', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    const otro = await crearUsuario(OTRO_EMAIL)

    await tareaMedida(user.id, 'gestion', 60, 60)
    await tareaMedida(user.id, 'gestion', 60, 60)
    await tareaMedida(user.id, 'gestion', 60, 60)
    // El otro usuario se desvía muchísimo; si se colara, el factor se dispararía.
    await tareaMedida(otro.id, 'gestion', 60, 600)
    await tareaMedida(otro.id, 'gestion', 60, 600)
    await tareaMedida(otro.id, 'gestion', 60, 600)

    const factores = await factorPorClase(user.id)
    expect(factores.gestion.muestras).toBe(3)
    expect(factores.gestion.factor).toBe(1)

    const factoresOtro = await factorPorClase(otro.id)
    expect(factoresOtro.gestion.factor).toBe(10)
  })
})
