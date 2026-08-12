import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createWeekPayload } from '@/app/api/v1/weeks/service'
import { competenciasParaPlaneacion } from '@/app/(app)/desarrollo/service'
import { contextoPlaneacion } from '@/app/(app)/semana/nueva/service'
import { deleteTestUser } from './helpers/cleanup'

// Etiquetar competencias al PLANEAR (no al cerrar) es la pieza 3 de la Fase 2b:
// el planeador es el único momento del ciclo en que todavía hay margen para
// decidir en qué se invierte la semana.

const TEST_EMAIL = 'test-comp-plan@vp.mx'

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

describe('competenciasParaPlaneacion', () => {
  it('pone los reactivos del nivel OBJETIVO primero — son los que deciden la promoción', async () => {
    const user = await usuario()
    const opciones = await competenciasParaPlaneacion(user.id)

    expect(opciones.length).toBeGreaterThan(0)
    expect(opciones[0].esObjetivo).toBe(true)
    expect(opciones[0].grupo).toBe('Objetivo · Gerente')

    // Y una vez que se acaban los del objetivo, no vuelven a aparecer más abajo.
    const ultimoObjetivo = opciones.findLastIndex((c) => c.esObjetivo)
    expect(opciones.slice(0, ultimoObjetivo + 1).every((c) => c.esObjetivo)).toBe(true)
  })

  it('excluye los reactivos de OTROS niveles — medirían contra un puesto que no se persigue', async () => {
    const user = await usuario()
    const opciones = await competenciasParaPlaneacion(user.id)
    const ids = new Set(opciones.map((c) => c.id))

    const deOtroNivel = await prisma.competency.findFirst({
      where: { tipo: 'nivel', grupo: { not: 'Gerente' } },
    })
    expect(deOtroNivel).not.toBeNull()
    expect(ids.has(deOtroNivel!.id)).toBe(false)
  })

  it('dentro de cada bloque los huecos van primero', async () => {
    const user = await usuario()
    const conducta = await prisma.competency.findFirstOrThrow({ where: { tipo: { not: 'nivel' } } })
    await prisma.evidence.create({ data: { userId: user.id, competencyId: conducta.id, nota: 'ya tiene' } })

    const opciones = await competenciasParaPlaneacion(user.id)
    const noObjetivo = opciones.filter((c) => !c.esObjetivo)

    expect(noObjetivo[0].vacia).toBe(true)
    expect(noObjetivo[noObjetivo.length - 1].id).toBe(conducta.id)
    expect(noObjetivo[noObjetivo.length - 1].vacia).toBe(false)
  })

  it('sin nivel objetivo no truena: devuelve solo conductas y roles', async () => {
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, nombre: 'Sin objetivo', passwordHash: 'x' },
    })
    const opciones = await competenciasParaPlaneacion(user.id)

    expect(opciones.length).toBeGreaterThan(0)
    expect(opciones.every((c) => c.esObjetivo === false)).toBe(true)
  })
})

describe('contextoPlaneacion expone el catálogo', () => {
  it('el planeador recibe las competencias para etiquetar', async () => {
    const user = await usuario()
    const ctx = await contextoPlaneacion(user.id, new Date('2026-08-12T12:00:00Z'))

    expect(ctx.competencias.length).toBeGreaterThan(0)
    expect(ctx.competencias[0].esObjetivo).toBe(true)
  })
})

describe('createWeekPayload conecta competencias', () => {
  it('etiqueta una tarea NUEVA creada en el ritual', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({ where: { grupo: 'La mano del Rey' } })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win' }],
      tasks: [{ ref: 'n1', titulo: 'presentar al comité', estimadoMin: 60, competenciaIds: [competencia.id] }],
      blocks: [],
    })

    const tarea = await prisma.task.findFirstOrThrow({
      where: { userId: user.id },
      include: { competencias: true },
    })
    expect(tarea.competencias.map((c) => c.id)).toEqual([competencia.id])
  })

  it('etiqueta una tarea ADOPTADA del backlog — es el camino que más se usa', async () => {
    const user = await usuario()
    const competencia = await prisma.competency.findFirstOrThrow({ where: { grupo: 'La mano del Rey' } })
    const pendiente = await prisma.task.create({
      data: { userId: user.id, titulo: 'del backlog', estatus: 'backlog' },
    })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [],
      tasks: [],
      adoptar: [{ id: pendiente.id, estimadoMin: 60, ajustadoMin: 84, competenciaIds: [competencia.id] }],
      blocks: [],
    })

    const tarea = await prisma.task.findUniqueOrThrow({
      where: { id: pendiente.id },
      include: { competencias: true },
    })
    expect(tarea.competencias.map((c) => c.id)).toEqual([competencia.id])
    expect(tarea.estatus).toBe('planned')
  })

  it('sin competenciaIds la tarea queda sin etiquetar, no truena', async () => {
    const user = await usuario()
    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 'n1', titulo: 'sin etiqueta', estimadoMin: 30 }],
      blocks: [],
    })

    const tarea = await prisma.task.findFirstOrThrow({
      where: { userId: user.id },
      include: { competencias: true },
    })
    expect(tarea.competencias).toHaveLength(0)
  })

  it('reetiquetar una adoptada reemplaza, no acumula', async () => {
    const user = await usuario()
    const [a, b] = await prisma.competency.findMany({ take: 2, orderBy: { id: 'asc' } })
    const pendiente = await prisma.task.create({
      data: { userId: user.id, titulo: 'del backlog', estatus: 'backlog', competencias: { connect: { id: a.id } } },
    })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W32',
      factorUsado: 1.4,
      wins: [],
      tasks: [],
      adoptar: [{ id: pendiente.id, competenciaIds: [b.id] }],
      blocks: [],
    })

    const tarea = await prisma.task.findUniqueOrThrow({
      where: { id: pendiente.id },
      include: { competencias: true },
    })
    expect(tarea.competencias.map((c) => c.id)).toEqual([b.id])
  })
})
