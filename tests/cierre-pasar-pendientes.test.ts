import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCierreDia, pasarPendientes, convertirDesvioEnTarea } from '@/app/(app)/cierre/service'
import { factorRealismoDetalle } from '@/lib/factor-realismo'
import { deleteTestUser } from './helpers/cleanup'

// El bug que estas pruebas fijan: mover los pendientes le cambia `fecha` a los
// bloques EN EL MISMO registro, y lo planeado se calcula leyendo bloques por
// fecha. Al mover primero, el día quedaba en cero y la reconciliación se volvía
// imposible — le pasó al 13-ago-2026 y el dato no se pudo recuperar.

const TEST_EMAIL = 'test-pasar@vp.mx'
const JUEVES = '2026-08-13'
const VIERNES = '2026-08-14'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
}

async function semana(userId: string) {
  return prisma.week.create({
    data: {
      userId,
      isoWeek: '2026-W33',
      rangoInicio: new Date('2026-08-10'),
      rangoFin: new Date('2026-08-16'),
      factorUsado: 1.4,
    },
  })
}

async function bloque(
  userId: string,
  weekId: string,
  d: { titulo: string; planMin: number; estatus?: 'planned' | 'done'; segundos?: number; fecha?: string }
) {
  const task = await prisma.task.create({
    data: { userId, weekId, titulo: d.titulo, estatus: d.estatus ?? 'planned' },
  })
  if (d.segundos) {
    await prisma.timeEntry.create({
      data: { userId, taskId: task.id, seconds: d.segundos, startedAt: new Date(JUEVES) },
    })
  }
  await prisma.block.create({
    data: {
      weekId,
      taskId: task.id,
      fecha: new Date(d.fecha ?? JUEVES),
      inicio: '09:00',
      fin: '10:00',
      tipo: 'tarea',
      titulo: d.titulo,
      planMin: d.planMin,
    },
  })
  return task
}

describe('pasarPendientes', () => {
  it('el día sigue siendo legible DESPUÉS de mover — es el bug del 13-ago', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await bloque(user.id, w.id, { titulo: 'sin terminar', planMin: 120, segundos: 1800 })
    await bloque(user.id, w.id, { titulo: 'otra sin terminar', planMin: 60 })

    const antes = await getCierreDia(user.id, JUEVES)
    expect(antes.planMin).toBe(180)
    expect(antes.medidoMin).toBe(30)

    const r = await pasarPendientes(user.id, JUEVES)
    expect(r.movidos).toBe(2)
    expect(r.hacia).toBe(VIERNES)

    // Los bloques ya NO tienen la fecha del jueves…
    expect(await prisma.block.count({ where: { fecha: new Date(JUEVES), week: { userId: user.id } } })).toBe(0)
    // …y sin embargo el jueves conserva sus cifras, vía snapshot.
    const despues = await getCierreDia(user.id, JUEVES)
    expect(despues.planMin).toBe(180)
    expect(despues.medidoMin).toBe(30)
    expect(despues.desdeSnapshot).toBe(true)
  })

  it('reporta cuántos movió y a dónde, en vez de terminar en silencio', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await bloque(user.id, w.id, { titulo: 'a', planMin: 30 })

    await pasarPendientes(user.id, JUEVES)

    const v = await getCierreDia(user.id, JUEVES)
    expect(v.yaMovidos).toEqual({ cuantos: 1, hacia: VIERNES })
  })

  it('no mueve lo que ya está terminado', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await bloque(user.id, w.id, { titulo: 'terminada', planMin: 60, estatus: 'done', segundos: 3600 })
    await bloque(user.id, w.id, { titulo: 'pendiente', planMin: 60 })

    const r = await pasarPendientes(user.id, JUEVES)

    expect(r.movidos).toBe(1)
    // La terminada se queda donde ocurrió: es historia, no pendiente.
    expect(await prisma.block.count({ where: { fecha: new Date(JUEVES), week: { userId: user.id } } })).toBe(1)
  })

  it('el viernes sí recibe los bloques movidos', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await bloque(user.id, w.id, { titulo: 'se mueve', planMin: 45 })

    await pasarPendientes(user.id, JUEVES)

    const v = await getCierreDia(user.id, VIERNES)
    expect(v.planMin).toBe(45)
    expect(v.pendientesPorMover).toBe(1)
  })

  it('mover dos veces NO degrada el snapshot al número más chico', async () => {
    const user = await usuario()
    const w = await semana(user.id)
    await bloque(user.id, w.id, { titulo: 'a', planMin: 100 })
    // Una que se queda porque está hecha, para que el segundo pase vea menos plan.
    await bloque(user.id, w.id, { titulo: 'b', planMin: 80, estatus: 'done', segundos: 600 })

    await pasarPendientes(user.id, JUEVES)
    const primera = await getCierreDia(user.id, JUEVES)
    expect(primera.planMin).toBe(180)

    await pasarPendientes(user.id, JUEVES)
    const segunda = await getCierreDia(user.id, JUEVES)

    // Si se sobrescribiera, aquí diría 80 y la línea base se habría perdido.
    expect(segunda.planMin).toBe(180)
  })

  it('un sábado cae en lunes, no en domingo', async () => {
    const user = await usuario()
    // 2026-08-15 es sábado; el siguiente hábil es el lunes 17.
    const r = await pasarPendientes(user.id, '2026-08-15')
    expect(r.hacia).toBe('2026-08-17')
    expect(r.movidos).toBe(0)
  })

  it('no toca los bloques de otro usuario', async () => {
    const user = await usuario()
    const otro = await prisma.user.create({ data: { email: 'test-pasar-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const wo = await prisma.week.create({
      data: {
        userId: otro.id,
        isoWeek: '2026-W33',
        rangoInicio: new Date('2026-08-10'),
        rangoFin: new Date('2026-08-16'),
        factorUsado: 1.4,
      },
    })
    await bloque(otro.id, wo.id, { titulo: 'ajena', planMin: 90 })

    const r = await pasarPendientes(user.id, JUEVES)
    expect(r.movidos).toBe(0)
    expect(await prisma.block.count({ where: { fecha: new Date(JUEVES), week: { userId: otro.id } } })).toBe(1)

    await deleteTestUser('test-pasar-otro@vp.mx')
  })
})

describe('convertirDesvioEnTarea', () => {
  async function proyecto(userId: string) {
    return prisma.project.create({ data: { userId, nombre: 'Liverpool' } })
  }

  it('registra el trabajo no planeado y lo manda al ledger aliado', async () => {
    const user = await usuario()
    const p = await proyecto(user.id)
    await semana(user.id)

    const { taskId } = await convertirDesvioEnTarea(user.id, {
      titulo: 'Reconstruir el puente de variación',
      minutos: 150,
      projectId: p.id,
      alcance: 'aliado',
      dolorCliente: 'El material no era presentable ante un VP',
      fecha: JUEVES,
    })

    const t = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: { timeEntries: true } })
    expect(t.alcance).toBe('aliado')
    expect(t.estatus).toBe('done')
    expect(t.dolorCliente).toContain('VP')
    expect(t.timeEntries[0].seconds).toBe(9000)
    // Marcado como manual: no salió del cronómetro y el dato debe decirlo.
    expect(t.timeEntries[0].manual).toBe(true)
    // Y se engancha a la semana que contiene la fecha.
    expect(t.weekId).not.toBeNull()
  })

  it('deja estimadoMin en NULL para no falsear el factor de realismo', async () => {
    const user = await usuario()
    const p = await proyecto(user.id)

    const { taskId } = await convertirDesvioEnTarea(user.id, {
      titulo: 'trabajo no planeado',
      minutos: 60,
      projectId: p.id,
      alcance: 'sow',
      fecha: JUEVES,
    })

    // Si trajera estimadoMin = 60, el ratio real/estimado sería 1.0 exacto y
    // jalaría el factor hacia 1.0 con un dato que nadie estimó nunca.
    expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).estimadoMin).toBeNull()
  })

  it('el trabajo aliado exige el dolor del cliente', async () => {
    const user = await usuario()
    const p = await proyecto(user.id)

    await expect(
      convertirDesvioEnTarea(user.id, {
        titulo: 'sin dolor',
        minutos: 60,
        projectId: p.id,
        alcance: 'aliado',
        fecha: JUEVES,
      })
    ).rejects.toThrow(/dolor del cliente/)

    // Dentro del SOW no se pide: ahí el alcance ya está contratado.
    await expect(
      convertirDesvioEnTarea(user.id, { titulo: 'sow', minutos: 60, projectId: p.id, alcance: 'sow', fecha: JUEVES })
    ).resolves.toBeTruthy()
  })

  it('rechaza título vacío, minutos en cero y proyecto ajeno', async () => {
    const user = await usuario()
    const p = await proyecto(user.id)
    const otro = await prisma.user.create({ data: { email: 'test-pasar-otro@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const ajeno = await prisma.project.create({ data: { userId: otro.id, nombre: 'Ajeno' } })

    const base = { minutos: 60, projectId: p.id, alcance: 'sow' as const, fecha: JUEVES }
    await expect(convertirDesvioEnTarea(user.id, { ...base, titulo: '   ' })).rejects.toThrow(/título/)
    await expect(convertirDesvioEnTarea(user.id, { ...base, titulo: 'x', minutos: 0 })).rejects.toThrow(/minutos/)
    await expect(
      convertirDesvioEnTarea(user.id, { ...base, titulo: 'x', projectId: ajeno.id })
    ).rejects.toThrow(/proyecto no encontrado/)

    await deleteTestUser('test-pasar-otro@vp.mx')
  })
})

describe('factorRealismoDetalle', () => {
  it('marca cuando el insumo del factor es mayormente tiempo metido a mano', async () => {
    const user = await usuario()
    // Tres semanas cerradas para pasar la compuerta de MIN_SEMANAS.
    for (const iso of ['2026-W30', '2026-W31', '2026-W32']) {
      await prisma.week.create({
        data: {
          userId: user.id,
          isoWeek: iso,
          rangoInicio: new Date('2026-07-20'),
          rangoFin: new Date('2026-07-26'),
          factorUsado: 1.4,
          estatus: 'closed',
        },
      })
    }
    // Dos tareas con tiempo MANUAL y una cronometrada.
    for (const [i, manual] of [true, true, false].entries()) {
      const t = await prisma.task.create({
        data: { userId: user.id, titulo: `t${i}`, estatus: 'done', estimadoMin: 60 },
      })
      await prisma.timeEntry.create({
        data: { userId: user.id, taskId: t.id, seconds: 3600, startedAt: new Date(JUEVES), manual },
      })
    }

    const d = await factorRealismoDetalle(user.id)

    expect(d.muestras).toBe(3)
    expect(d.muestrasManuales).toBe(2)
    expect(d.insumoMayormenteManual).toBe(true)
    expect(d.esManualPuro).toBe(false)
  })

  it('sin 3 semanas cerradas devuelve el manual y lo declara', async () => {
    const user = await usuario()
    const d = await factorRealismoDetalle(user.id)

    expect(d.factor).toBe(1.4)
    expect(d.esManualPuro).toBe(true)
    expect(d.muestras).toBe(0)
  })
})
