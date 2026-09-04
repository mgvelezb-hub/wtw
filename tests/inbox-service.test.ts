import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import {
  listInbox,
  triageTask,
  createInboxTask,
  discardTask,
  getHerramientaFactors,
  sugerenciasDeClase,
  etiquetarClases,
} from '@/app/(app)/inbox/service'

const TEST_EMAIL = 'test-inbox@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('listInbox', () => {
  it('devuelve solo tasks backlog del usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Idea suelta', estatus: 'backlog' } })
    await prisma.task.create({ data: { userId: user.id, titulo: 'Ya planeada', estatus: 'planned' } })
    const inbox = await listInbox(user.id)
    expect(inbox).toHaveLength(1)
    expect(inbox[0].titulo).toBe('Idea suelta')
  })
})

describe('createInboxTask', () => {
  it('crea una task en backlog con alcance sow por default', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await createInboxTask(user.id, { titulo: 'Nueva idea' })
    expect(task.estatus).toBe('backlog')
    expect(task.alcance).toBe('sow')
  })
})

describe('triageTask', () => {
  it('mueve una task de backlog a planned dentro de una semana', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const week = await prisma.week.create({
      data: { userId: user.id, isoWeek: '2026-W28', rangoInicio: new Date(), rangoFin: new Date(), factorUsado: 1.4 },
    })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    const result = await triageTask(task.id, user.id, { weekId: week.id, estimadoMin: 60 })
    expect(result.estatus).toBe('planned')
    expect(result.weekId).toBe(week.id)
    expect(result.estimadoMin).toBe(60)
  })

  it('lanza si la task no pertenece al usuario', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    await expect(triageTask(task.id, 'otro-id', {})).rejects.toThrow()
  })
})

describe('getHerramientaFactors', () => {
  it('calcula el factor real/estimado con al menos 2 muestras', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    for (const estimado of [60, 100]) {
      const task = await prisma.task.create({
        data: { userId: user.id, titulo: 'Excel task', estatus: 'done', herramienta: 'Excel', estimadoMin: estimado },
      })
      await prisma.timeEntry.create({
        data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: estimado * 1.5 * 60 },
      })
    }
    const factores = await getHerramientaFactors(user.id)
    expect(factores['Excel']).toBeCloseTo(1.5, 1)
  })

  it('omite herramientas con menos de 2 muestras', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await prisma.task.create({
      data: { userId: user.id, titulo: 'Python task', estatus: 'done', herramienta: 'Python', estimadoMin: 60 },
    })
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: task.id, startedAt: new Date(), stoppedAt: new Date(), seconds: 3600 },
    })
    const factores = await getHerramientaFactors(user.id)
    expect(factores['Python']).toBeUndefined()
  })
})

describe('discardTask', () => {
  it('marca la task como deferred', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const task = await prisma.task.create({ data: { userId: user.id, titulo: 'Idea', estatus: 'backlog' } })
    const result = await discardTask(task.id, user.id)
    expect(result.estatus).toBe('deferred')
  })
})

async function usuario() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
}

describe('clases en lote', () => {
  it('lista todo lo que no trae clase y sugiere donde hay señal', async () => {
    const user = await usuario()
    await prisma.task.create({
      data: { userId: user.id, titulo: 'Deck del comité de negociaciones', estatus: 'done', tipoTrabajo: 'deck' },
    })
    const sinClase = await prisma.task.create({
      data: { userId: user.id, titulo: 'Deck del comité de octubre', estatus: 'backlog' },
    })
    const yaTiene = await prisma.task.create({
      data: { userId: user.id, titulo: 'Facturar el entregable', estatus: 'backlog', tipoTrabajo: 'gestion' },
    })
    const sinSenal = await prisma.task.create({ data: { userId: user.id, titulo: 'Zzz', estatus: 'backlog' } })

    const s = await sugerenciasDeClase(user.id)

    // Las dos sin clase entran a la lista: el panel es el camino para etiquetar
    // en lote, y esconder la que el heurístico no reconoce dejaría fuera justo
    // lo que nadie va a etiquetar solo.
    expect(new Set(s.map((x) => x.id))).toEqual(new Set([sinClase.id, sinSenal.id]))
    expect(s.find((x) => x.id === sinClase.id)).toMatchObject({
      tipo: 'deck',
      fuente: 'historico',
      porque: 'Deck del comité de negociaciones',
    })
    // Sin señal no se inventa una clase, pero la tarea igual se ofrece.
    expect(s.find((x) => x.id === sinSenal.id)).toMatchObject({ tipo: null, fuente: null })
    // Lo que ya tiene clase no se toca.
    expect(s.map((x) => x.id)).not.toContain(yaTiene.id)
  })

  it('etiquetar en lote escribe todas las clases y no cruza usuarios', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({
      data: { email: 'test-inbox-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' },
    })
    const mia = await prisma.task.create({ data: { userId: user.id, titulo: 'Deck', estatus: 'backlog' } })
    const otra = await prisma.task.create({ data: { userId: user.id, titulo: 'Modelo', estatus: 'backlog' } })
    const ajena = await prisma.task.create({ data: { userId: otro.id, titulo: 'Ajena', estatus: 'backlog' } })

    const escritas = await etiquetarClases(user.id, [
      { id: mia.id, tipo: 'deck' },
      { id: otra.id, tipo: 'analisis' },
      { id: ajena.id, tipo: 'junta' },
    ])

    expect(escritas).toBe(2) // la ajena no cuenta: el updateMany filtra por userId
    expect((await prisma.task.findUniqueOrThrow({ where: { id: mia.id } })).tipoTrabajo).toBe('deck')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: otra.id } })).tipoTrabajo).toBe('analisis')
    expect((await prisma.task.findUniqueOrThrow({ where: { id: ajena.id } })).tipoTrabajo).toBeNull()

    await deleteTestUser('test-inbox-otro@vp.mx')
  })
})
