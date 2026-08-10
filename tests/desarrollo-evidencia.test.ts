import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import {
  getDesarrollo,
  competenciasParaEvidencia,
  getBitacoraDelegacion,
  getHistorialRiesgos,
} from '@/app/(app)/desarrollo/service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-desarrollo-ev@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  const gerente = await prisma.level.findFirst({ where: { nombre: 'Gerente' } })
  const consultor = await prisma.level.findFirst({ where: { nombre: 'Consultor Sr' } })
  return prisma.user.create({
    data: {
      email: TEST_EMAIL,
      nombre: 'Test',
      passwordHash: 'x',
      nivelActualId: consultor?.id,
      nivelObjetivoId: gerente?.id,
    },
  })
}

describe('getDesarrollo', () => {
  it('reporta el nivel objetivo con sus expectativas y el conteo de huecos', async () => {
    const user = await usuario()
    const view = await getDesarrollo(user.id)

    expect(view.nivelActual).toBe('Consultor Sr')
    expect(view.nivelObjetivo).toBe('Gerente')
    expect(view.expectativasObjetivo).toContain('stakeholders')
    // Sin evidencia, todos los reactivos son hueco.
    expect(view.totalConEvidencia).toBe(0)
    expect(view.huecos).toHaveLength(view.totalReactivos)
    expect(view.totalReactivos).toBeGreaterThan(40)
  })

  it('agrupa por rol VP y cuenta cobertura por grupo', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({ where: { grupo: 'La mano del Rey' } })
    await prisma.evidence.create({
      data: { userId: user.id, competencyId: competencia.id, nota: 'presenté en el comité' },
    })

    const view = await getDesarrollo(user.id)
    const grupo = view.grupos.find((g) => g.grupo === 'La mano del Rey')

    expect(grupo?.conEvidencia).toBe(1)
    expect(grupo!.total).toBeGreaterThan(1)
    expect(view.totalConEvidencia).toBe(1)
    expect(view.huecos.some((h) => h.id === competencia.id)).toBe(false)
  })

  it('calcula los días desde la última evidencia, no solo el conteo', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({ where: { grupo: 'Los datos duros' } })
    // Una competencia con evidencia vieja está tan hueca como una vacía; el
    // conteo plano no lo mostraba.
    await prisma.evidence.create({
      data: {
        userId: user.id,
        competencyId: competencia.id,
        nota: 'vieja',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    })

    const view = await getDesarrollo(user.id, new Date('2026-08-10T00:00:00Z'))
    const c = view.grupos.flatMap((g) => g.competencias).find((x) => x.id === competencia.id)

    expect(c?.evidenciaCount).toBe(1)
    expect(c?.diasDesdeUltima).toBe(70)
  })

  it('no cuenta la evidencia de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({ data: { email: 'test-desarrollo-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const competencia = await prisma.competency.findFirstOrThrow({})
    await prisma.evidence.create({ data: { userId: otro.id, competencyId: competencia.id, nota: 'de otro' } })

    const view = await getDesarrollo(user.id)
    expect(view.totalConEvidencia).toBe(0)

    await prisma.evidence.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })
})

describe('competenciasParaEvidencia', () => {
  it('pone los reactivos vacíos primero — llenar un hueco vale más que engordar uno lleno', async () => {
    const user = await usuario()
    const primera = await prisma.competency.findFirstOrThrow({ orderBy: { orden: 'asc' } })
    await prisma.evidence.create({ data: { userId: user.id, competencyId: primera.id, nota: 'ya tiene' } })

    const opciones = await competenciasParaEvidencia(user.id)

    expect(opciones[0].vacia).toBe(true)
    expect(opciones[opciones.length - 1].id).toBe(primera.id)
    expect(opciones[opciones.length - 1].vacia).toBe(false)
  })
})

describe('bitácora de delegación', () => {
  it('suma horas reales, no conteo de tareas', async () => {
    const user = await usuario()
    const t1 = await prisma.task.create({
      data: { userId: user.id, titulo: 'limpiar el excel', estatus: 'done', delegable: true, delegableNota: 'analista' },
    })
    await prisma.task.create({ data: { userId: user.id, titulo: 'no delegable', estatus: 'done' } })
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: t1.id, startedAt: new Date('2026-08-03T09:00:00Z'), seconds: 120 * 60 },
    })

    const b = await getBitacoraDelegacion(user.id)

    expect(b.tareas).toHaveLength(1)
    expect(b.tareas[0].nota).toBe('analista')
    expect(b.minutosTotales).toBe(120)
  })

  it('está vacía si no hay nada marcado', async () => {
    const user = await usuario()
    await prisma.task.create({ data: { userId: user.id, titulo: 'normal', estatus: 'done' } })

    const b = await getBitacoraDelegacion(user.id)
    expect(b.tareas).toHaveLength(0)
    expect(b.minutosTotales).toBe(0)
    expect(b.desde).toBeNull()
  })
})

describe('riesgos del pre-mortem', () => {
  it('el planeador los persiste en vez de tirarlos', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W33',
      factorUsado: 1.4,
      wins: [],
      tasks: [],
      blocks: [],
      riesgos: [
        { riesgo: 'Liverpool mueve la junta del jueves', defensa: 'cerrar el análisis el miércoles' },
        { riesgo: 'la MV no conecta a Postgres', defensa: 'probar la conexión el lunes' },
      ],
    })

    const guardados = await prisma.weekRisk.findMany({ where: { weekId: week.id }, orderBy: { orden: 'asc' } })
    expect(guardados).toHaveLength(2)
    expect(guardados[0].riesgo).toContain('Liverpool')
    // null, no false: la semana no se ha cerrado, así que no se sabe si ocurrió.
    expect(guardados[0].ocurrio).toBeNull()
  })

  it('distingue predicho / ocurrido / defensa efectiva', async () => {
    const user = await usuario()
    const week = await createWeekPayload(user.id, {
      isoWeek: '2026-W33',
      factorUsado: 1.4,
      wins: [],
      tasks: [],
      blocks: [],
      riesgos: [
        { riesgo: 'r1', defensa: 'd1' },
        { riesgo: 'r2', defensa: 'd2' },
        { riesgo: 'r3', defensa: 'd3' },
      ],
    })
    const rs = await prisma.weekRisk.findMany({ where: { weekId: week.id }, orderBy: { orden: 'asc' } })
    await prisma.weekRisk.update({ where: { id: rs[0].id }, data: { ocurrio: true, defensaFunciono: true } })
    await prisma.weekRisk.update({ where: { id: rs[1].id }, data: { ocurrio: true, defensaFunciono: false } })
    await prisma.weekRisk.update({ where: { id: rs[2].id }, data: { ocurrio: false } })

    const h = await getHistorialRiesgos(user.id)

    expect(h.total).toBe(3)
    expect(h.cerrados).toBe(3)
    expect(h.acertados).toBe(2)
    expect(h.defensasEfectivas).toBe(1)
    expect(h.abiertos).toHaveLength(0)
  })

  it('los riesgos sin cerrar de una semana viva quedan como abiertos', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W33',
      factorUsado: 1.4,
      wins: [],
      tasks: [],
      blocks: [],
      riesgos: [{ riesgo: 'sin cerrar', defensa: 'd' }],
    })

    const h = await getHistorialRiesgos(user.id)
    expect(h.abiertos).toHaveLength(1)
    expect(h.abiertos[0].isoWeek).toBe('2026-W33')
    expect(h.cerrados).toBe(0)
  })
})
