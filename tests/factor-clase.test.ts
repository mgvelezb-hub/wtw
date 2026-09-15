import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { factorPorClase } from '@/lib/factor-clase'
import type { TipoTrabajo } from '@prisma/client'
import { TIPOS_TRABAJO } from '@/lib/tipo-trabajo'

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

  it('devuelve TODAS las clases del catálogo, con null en las que no tienen datos', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    const factores = await factorPorClase(user.id)
    // Se compara contra el catálogo, no contra una lista escrita a mano: el
    // catálogo creció el 2026-09-14 con desarrollo, datos y pruebas, y volverá a
    // crecer. Un test que enumera las clases se rompe cada vez que eso pasa sin
    // que nada esté mal.
    expect(Object.keys(factores).sort()).toEqual([...TIPOS_TRABAJO].sort())
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

describe('mediciones que no son mediciones', () => {
  it('una tarea con menos del 25% medido no entra a la muestra', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    await tareaMedida(user.id, 'deck', 60, 90)
    await tareaMedida(user.id, 'deck', 60, 90)
    await tareaMedida(user.id, 'deck', 120, 150)
    // 125 planeados, 1 medido: el cronómetro no se prendió. Antes entraba —el
    // filtro solo descartaba el cero— y arrastraba el factor hacia abajo, que es
    // justo el error que este cálculo existe para corregir.
    await tareaMedida(user.id, 'deck', 125, 1)

    const factores = await factorPorClase(user.id)
    expect(factores.deck.muestras).toBe(3)
    expect(factores.deck.factor).toBe(1.4)
  })

  it('descartarla puede dejar la clase por debajo del mínimo, y eso está bien', async () => {
    const user = await crearUsuario(TEST_EMAIL)
    await tareaMedida(user.id, 'datos', 60, 70)
    await tareaMedida(user.id, 'datos', 60, 70)
    await tareaMedida(user.id, 'datos', 200, 2)

    const factores = await factorPorClase(user.id)
    // Dos muestras no son un factor. Antes habría publicado uno con la tercera
    // inventada: preferible no sugerir corrección a sugerir la equivocada.
    expect(factores.datos.muestras).toBe(2)
    expect(factores.datos.factor).toBeNull()
  })
})
