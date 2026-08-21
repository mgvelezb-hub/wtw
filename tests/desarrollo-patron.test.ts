import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getDesarrollo, UMBRAL_PATRON } from '@/app/(app)/desarrollo/service'
import { deleteTestUser } from './helpers/cleanup'

// El motor de carrera no mide cuántas evidencias hay: mide si el comité leería
// un PATRÓN. Tres piezas es el umbral, y tres piezas del mismo proyecto —o con
// el mismo testigo— siguen siendo una anécdota larga. Estos tests fijan las dos
// reglas y la persistencia de los dos campos que las alimentan.

const TEST_EMAIL = 'test-desarrollo-patron@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  const [gerente, consultor] = await Promise.all([
    prisma.level.findFirst({ where: { nombre: 'Gerente' } }),
    prisma.level.findFirst({ where: { nombre: 'Consultor Sr' } }),
  ])
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

function reactivoGerente(orden: number) {
  return prisma.competency.findFirstOrThrow({ where: { tipo: 'nivel', grupo: 'Gerente', orden } })
}

async function tareaEn(userId: string, proyecto: string) {
  const project = await prisma.project.upsert({
    where: { userId_nombre: { userId, nombre: proyecto } },
    create: { userId, nombre: proyecto },
    update: {},
  })
  return prisma.task.create({ data: { userId, projectId: project.id, titulo: `trabajo en ${proyecto}` } })
}

async function evidencia(
  userId: string,
  competencyId: string,
  opts: { nota?: string; proyecto?: string; testigo?: string; nivelDemostrado?: string } = {}
) {
  const task = opts.proyecto ? await tareaEn(userId, opts.proyecto) : null
  return prisma.evidence.create({
    data: {
      userId,
      competencyId,
      taskId: task?.id,
      nota: opts.nota ?? 'lo hice',
      testigo: opts.testigo ?? null,
      nivelDemostrado: opts.nivelDemostrado ?? null,
    },
  })
}

describe('semáforo de evidencia — el umbral es 3 porque es patrón, no anécdota', () => {
  it('0 piezas es sin_evidencia, 1-2 es anécdota, 3+ es patrón', async () => {
    const user = await usuario()
    const r10 = await reactivoGerente(10)
    const r11 = await reactivoGerente(11)

    await evidencia(user.id, r10.id, { proyecto: 'Liverpool' })
    await evidencia(user.id, r10.id, { proyecto: 'HUF' })

    for (const proyecto of ['Liverpool', 'HUF', 'Baratera']) {
      await evidencia(user.id, r11.id, { proyecto })
    }

    const view = await getDesarrollo(user.id)
    const porOrden = new Map(view.patron!.reactivos.map((r) => [r.orden, r]))

    expect(porOrden.get(9)!.semaforo).toBe('sin_evidencia')
    expect(porOrden.get(9)!.evidenciaCount).toBe(0)
    expect(porOrden.get(10)!.semaforo).toBe('anecdota')
    expect(porOrden.get(11)!.semaforo).toBe('patron')
    expect(porOrden.get(11)!.evidenciaCount).toBe(UMBRAL_PATRON)
  })

  it('el veredicto cuenta reactivos con patrón, no evidencias sueltas', async () => {
    const user = await usuario()
    const r12 = await reactivoGerente(12)
    // Cuatro piezas en UN reactivo no son cuatro reactivos cubiertos.
    for (const proyecto of ['Liverpool', 'HUF', 'Baratera', 'EJEZ3D']) {
      await evidencia(user.id, r12.id, { proyecto })
    }

    const view = await getDesarrollo(user.id)

    expect(view.patron!.total).toBe(4)
    expect(view.patron!.conPatron).toBe(1)
    expect(view.patron!.veredicto).toBe('Evidencia de nivel Gerente: 1 de 4 reactivos con patrón')
  })

  it('sin nivel objetivo con reactivos publicados, no hay dashboard que fingir', async () => {
    const socio = await prisma.level.findFirstOrThrow({ where: { nombre: 'Socio' } })
    const user = await usuario()
    await prisma.user.update({ where: { id: user.id }, data: { nivelObjetivoId: socio.id } })

    const view = await getDesarrollo(user.id)
    expect(view.patron).toBeNull()
  })
})

describe('amplitud y concentración — el comité pide patrón, no un solo frente', () => {
  it('3 evidencias del mismo proyecto disparan la alerta de concentración', async () => {
    const user = await usuario()
    const r10 = await reactivoGerente(10)
    for (let i = 0; i < 3; i++) {
      await evidencia(user.id, r10.id, { proyecto: 'Liverpool', testigo: 'Carlos Sierra' })
    }

    const view = await getDesarrollo(user.id)
    const r = view.patron!.reactivos.find((x) => x.orden === 10)!

    // Tiene patrón por conteo pero no por amplitud: esa es justo la trampa que
    // el semáforo solo no detecta.
    expect(r.semaforo).toBe('patron')
    expect(r.proyectos).toEqual(['Liverpool'])
    expect(r.alertas.some((a) => a.includes('Liverpool'))).toBe(true)
    expect(r.alertas.some((a) => a.includes('Carlos Sierra'))).toBe(true)
  })

  it('repartidas en 2+ proyectos y 2+ testigos, no hay alerta', async () => {
    const user = await usuario()
    const r10 = await reactivoGerente(10)
    await evidencia(user.id, r10.id, { proyecto: 'Liverpool', testigo: 'Carlos Sierra' })
    await evidencia(user.id, r10.id, { proyecto: 'HUF', testigo: 'Moisés' })
    await evidencia(user.id, r10.id, { proyecto: 'Baratera', testigo: 'Carlos Sierra' })

    const view = await getDesarrollo(user.id)
    const r = view.patron!.reactivos.find((x) => x.orden === 10)!

    expect(r.proyectos).toHaveLength(3)
    expect(r.testigos).toHaveLength(2)
    expect(r.alertas).toEqual([])
  })

  it('una sola pieza no dispara concentración: con una no hay nada concentrado todavía', async () => {
    const user = await usuario()
    const r10 = await reactivoGerente(10)
    await evidencia(user.id, r10.id, { proyecto: 'Liverpool' })

    const view = await getDesarrollo(user.id)
    expect(view.patron!.reactivos.find((x) => x.orden === 10)!.alertas).toEqual([])
  })

  it('el siguiente paso apunta al reactivo más hueco, no al primero de la lista', async () => {
    const user = await usuario()
    // 9, 11 y 12 con evidencia; 10 vacío → el paso tiene que ser el 10.
    for (const orden of [9, 11, 12]) {
      const r = await reactivoGerente(orden)
      await evidencia(user.id, r.id, { proyecto: 'Liverpool' })
    }

    const view = await getDesarrollo(user.id)
    expect(view.patron!.siguientePaso).toContain('reactivo 10')
  })
})

describe('testigo y nivel demostrado', () => {
  it('persisten y llegan a la vista junto con el proyecto de la pieza', async () => {
    const user = await usuario()
    const r12 = await reactivoGerente(12)
    await evidencia(user.id, r12.id, {
      nota: 'acordé agenda directa con Moisés',
      proyecto: 'Liverpool',
      testigo: 'Moisés Ramírez',
      nivelDemostrado: 'Gerente',
    })

    const view = await getDesarrollo(user.id)
    const [pieza] = view.patron!.reactivos.find((x) => x.orden === 12)!.piezas

    expect(pieza.testigo).toBe('Moisés Ramírez')
    expect(pieza.nivelDemostrado).toBe('Gerente')
    expect(pieza.proyecto).toBe('Liverpool')
    expect(pieza.nota).toBe('acordé agenda directa con Moisés')
  })

  it('son opcionales: una evidencia sin ellos sigue contando como pieza', async () => {
    const user = await usuario()
    const r12 = await reactivoGerente(12)
    await evidencia(user.id, r12.id)

    const view = await getDesarrollo(user.id)
    const r = view.patron!.reactivos.find((x) => x.orden === 12)!

    expect(r.evidenciaCount).toBe(1)
    expect(r.piezas[0].testigo).toBeNull()
    expect(r.piezas[0].nivelDemostrado).toBeNull()
    expect(r.testigos).toEqual([])
  })
})
