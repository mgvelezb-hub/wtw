import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getPromotionCase } from '@/app/(app)/desarrollo/caso/service'
import { deleteTestUser } from './helpers/cleanup'

// El one-pager es una lectura de getDesarrollo (../service.ts), no un cálculo
// aparte: estos tests fijan lo que SÍ es propio de este service — recorte a 3
// piezas por reactivo con testigo primero, el impacto de cliente, y que ambos
// queden escopados a userId — y no repiten los tests de semáforo/alertas que
// ya cubre tests/desarrollo-patron.test.ts.

const TEST_EMAIL = 'test-promotion-case@vp.mx'
const OTRO_EMAIL = 'test-promotion-case-otro@vp.mx'

beforeEach(async () => {
  await deleteTestUser(TEST_EMAIL)
  await deleteTestUser(OTRO_EMAIL)
})

async function usuario(email: string) {
  const [gerente, consultor] = await Promise.all([
    prisma.level.findFirst({ where: { nombre: 'Gerente' } }),
    prisma.level.findFirst({ where: { nombre: 'Consultor Sr' } }),
  ])
  return prisma.user.create({
    data: {
      email,
      nombre: email === TEST_EMAIL ? 'Test Promotion Case' : 'Otro Usuario',
      passwordHash: 'x',
      nivelActualId: consultor?.id,
      nivelObjetivoId: gerente?.id,
    },
  })
}

function reactivoGerente(orden: number) {
  return prisma.competency.findFirstOrThrow({ where: { tipo: 'nivel', grupo: 'Gerente', orden } })
}

async function proyecto(userId: string, nombre: string) {
  return prisma.project.upsert({
    where: { userId_nombre: { userId, nombre } },
    create: { userId, nombre },
    update: {},
  })
}

async function tareaEn(userId: string, nombreProyecto: string) {
  const p = await proyecto(userId, nombreProyecto)
  return prisma.task.create({ data: { userId, projectId: p.id, titulo: `trabajo en ${nombreProyecto}` } })
}

async function evidencia(
  userId: string,
  competencyId: string,
  opts: { nota?: string; proyecto?: string; testigo?: string } = {}
) {
  const task = opts.proyecto ? await tareaEn(userId, opts.proyecto) : null
  return prisma.evidence.create({
    data: {
      userId,
      competencyId,
      taskId: task?.id,
      nota: opts.nota ?? 'lo hice',
      testigo: opts.testigo ?? null,
    },
  })
}

async function impacto(
  userId: string,
  nombreProyecto: string,
  opts: { entregable?: string; baseline?: string; delta?: string; validadoPor?: string } = {}
) {
  const p = await proyecto(userId, nombreProyecto)
  const deliverable = await prisma.deliverable.create({
    data: { projectId: p.id, nombre: opts.entregable ?? 'Entregable de prueba' },
  })
  return prisma.impactoEntregable.create({
    data: {
      deliverableId: deliverable.id,
      baseline: opts.baseline ?? 'fill rate 71%',
      delta: opts.delta ?? '→ 78.4%',
      validadoPor: opts.validadoPor ?? null,
    },
  })
}

describe('getPromotionCase — veredicto y evidencia recortada', () => {
  it('trae el mismo veredicto y conteo que getDesarrollo, sin recalcular el patrón', async () => {
    const user = await usuario(TEST_EMAIL)
    const r12 = await reactivoGerente(12)
    for (const proyectoNombre of ['Liverpool', 'HUF', 'Baratera']) {
      await evidencia(user.id, r12.id, { proyecto: proyectoNombre })
    }

    const caso = await getPromotionCase(user.id)

    expect(caso.veredicto).toBe('Evidencia de nivel Gerente: 1 de 4 reactivos con patrón')
    expect(caso.conPatron).toBe(1)
    expect(caso.totalReactivos).toBe(4)
    expect(caso.nivelActual).toBe('Consultor Sr')
    expect(caso.nivelObjetivo).toBe('Gerente')
  })

  it('ordena las piezas testigo-primero y recorta a 3 por reactivo', async () => {
    const user = await usuario(TEST_EMAIL)
    const r10 = await reactivoGerente(10)

    // 4 piezas: 2 sin testigo primero, luego 2 con testigo. El resultado debe
    // traer las 3 con testigo primero... espera, solo hay 2 con testigo, así
    // que el orden esperado es: las 2 con testigo primero (en el orden en que
    // getDesarrollo ya las trae, más reciente primero) y luego 1 sin testigo
    // para completar el máximo de 3.
    await evidencia(user.id, r10.id, { nota: 'sin testigo A', proyecto: 'Liverpool' })
    await evidencia(user.id, r10.id, { nota: 'con testigo B', proyecto: 'HUF', testigo: 'Moisés' })
    await evidencia(user.id, r10.id, { nota: 'sin testigo C', proyecto: 'Baratera' })
    await evidencia(user.id, r10.id, { nota: 'con testigo D', proyecto: 'EJEZ3D', testigo: 'Carlos Sierra' })

    const caso = await getPromotionCase(user.id)
    const r = caso.reactivos.find((x) => x.orden === 10)!

    expect(r.evidenciaCount).toBe(4)
    expect(r.piezas).toHaveLength(3)
    expect(r.piezas.filter((p) => p.testigo !== null)).toHaveLength(2)
    // Las dos con testigo van antes que la única sin testigo que entró al recorte.
    expect(r.piezas[0].testigo).not.toBeNull()
    expect(r.piezas[1].testigo).not.toBeNull()
    expect(r.piezas[2].testigo).toBeNull()
  })

  it('la línea de huecos son los reactivos objetivo que no llegaron a patrón', async () => {
    const user = await usuario(TEST_EMAIL)
    const r12 = await reactivoGerente(12)
    for (const proyectoNombre of ['Liverpool', 'HUF', 'Baratera']) {
      await evidencia(user.id, r12.id, { proyecto: proyectoNombre })
    }

    const caso = await getPromotionCase(user.id)

    // Reactivo 12 tiene patrón (3 piezas) — no debe salir en huecos. Los demás
    // (9, 10, 11) siguen sin evidencia — sí deben salir.
    expect(
      caso.huecos.map((h) => h.orden).sort((a, b) => a - b)
    ).toEqual([9, 10, 11])
  })
})

describe('getPromotionCase — impacto de cliente', () => {
  it('trae el ImpactoEntregable del entregable, con su proyecto y quién lo validó', async () => {
    const user = await usuario(TEST_EMAIL)
    await impacto(user.id, 'Liverpool', {
      entregable: 'Estrategia de transporte',
      baseline: 'fill rate 71%',
      delta: '→ 78.4%, +$12 MM anualizados',
      validadoPor: 'Carlos Sierra',
    })

    const caso = await getPromotionCase(user.id)

    expect(caso.impactos).toHaveLength(1)
    expect(caso.impactos[0]).toMatchObject({
      entregable: 'Estrategia de transporte',
      proyecto: 'Liverpool',
      baseline: 'fill rate 71%',
      delta: '→ 78.4%, +$12 MM anualizados',
      validadoPor: 'Carlos Sierra',
    })
  })

  it('validadoPor es opcional y llega como null si no se capturó', async () => {
    const user = await usuario(TEST_EMAIL)
    await impacto(user.id, 'Liverpool')

    const caso = await getPromotionCase(user.id)
    expect(caso.impactos[0].validadoPor).toBeNull()
  })
})

describe('getPromotionCase — aislamiento por usuario', () => {
  it('un usuario ajeno no contamina ni la evidencia ni el impacto del caso', async () => {
    const user = await usuario(TEST_EMAIL)
    const otro = await usuario(OTRO_EMAIL)
    const r10 = await reactivoGerente(10)

    await evidencia(user.id, r10.id, { nota: 'mío', proyecto: 'Liverpool', testigo: 'Moisés' })
    await impacto(user.id, 'Liverpool', { entregable: 'Mío' })

    await evidencia(otro.id, r10.id, { nota: 'ajeno', proyecto: 'HUF', testigo: 'Alguien más' })
    await impacto(otro.id, 'HUF', { entregable: 'Ajeno' })

    const caso = await getPromotionCase(user.id)
    const r = caso.reactivos.find((x) => x.orden === 10)!

    expect(r.piezas).toHaveLength(1)
    expect(r.piezas[0].nota).toBe('mío')
    expect(caso.impactos).toHaveLength(1)
    expect(caso.impactos[0].entregable).toBe('Mío')
  })
})
