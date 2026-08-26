import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { delegarTarea, deshacerDelegacion } from '@/app/(app)/dia/delegacion-service'
import { getDiaView } from '@/app/(app)/dia/service'
import { factorPorClase } from '@/lib/factor-clase'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-delegacion@vp.mx'

async function setup() {
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL, nombre: 'T', passwordHash: 'x',
      horarioInicio: '09:00', horarioFin: '18:00', comidaInicio: '14:00', comidaFin: '15:00',
    },
  })
  const week = await prisma.week.create({
    data: { userId: user.id, isoWeek: '2026-W28', rangoInicio: new Date('2026-07-06'), rangoFin: new Date('2026-07-10'), factorUsado: 1.4 },
  })
  const task = await prisma.task.create({
    data: { userId: user.id, weekId: week.id, titulo: 'Redactar pushbacks', estatus: 'planned', estimadoMin: 60, ajustadoMin: 84 },
  })
  const block = await prisma.block.create({
    data: { weekId: week.id, taskId: task.id, fecha: new Date('2026-07-06'), inicio: '09:00', fin: '10:24', tipo: 'tarea', titulo: 'Redactar pushbacks', planMin: 84 },
  })
  return { user, week, task, block }
}

beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('delegarTarea', () => {
  it('guarda a quién se delegó y cambia el estatus', async () => {
    const { user, task } = await setup()

    await delegarTarea(task.id, user.id, 'Mike')

    const t = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(t.estatus).toBe('delegada')
    expect(t.delegadoA).toBe('Mike')
  })

  it('exige nombre: sin a-quién no es seguimiento de nadie', async () => {
    const { user, task } = await setup()
    await expect(delegarTarea(task.id, user.id, '   ')).rejects.toThrow()
  })

  it('la tarea NO desaparece del día — sigue como compromiso de un tercero', async () => {
    const { user, task, block } = await setup()

    await delegarTarea(task.id, user.id, 'Mike')

    const b = await prisma.block.findUnique({ where: { id: block.id } })
    expect(b).not.toBeNull()
    const vista = await getDiaView(user.id, '2026-W28', '2026-07-06', '2026-07-06')
    expect(vista.blocks.some((x) => x.taskId === task.id)).toBe(true)
  })

  it('sale del planeado del día: esas horas ya no son de Mau', async () => {
    const { user, task } = await setup()

    const antes = await getDiaView(user.id, '2026-W28', '2026-07-06', '2026-07-06')
    expect(antes.planeadoMin).toBe(84)

    await delegarTarea(task.id, user.id, 'Mike')

    const despues = await getDiaView(user.id, '2026-W28', '2026-07-06', '2026-07-06')
    expect(despues.planeadoMin).toBe(0)
  })

  it('sale de la carga de la semana', async () => {
    const { user, task } = await setup()

    const antes = await getDiaView(user.id, '2026-W28', '2026-07-06', '2026-07-06')
    expect(antes.cargaSemHoras).toBeCloseTo(84 / 60, 2)

    await delegarTarea(task.id, user.id, 'Mike')

    const despues = await getDiaView(user.id, '2026-W28', '2026-07-06', '2026-07-06')
    expect(despues.cargaSemHoras).toBe(0)
  })

  // Lo que Mau pidió explícitamente: una tarea delegada no se cronometra, así que
  // contarla como muestra metería un cero al numerador y sesgaría el factor hacia
  // abajo — el error opuesto al que el factor existe para corregir.
  it('nunca entra al factor de realismo por clase', async () => {
    const { user, week } = await setup()

    // Tres tareas medidas de la misma clase, para pasar el mínimo de muestras.
    for (let i = 0; i < 3; i++) {
      const t = await prisma.task.create({
        data: { userId: user.id, weekId: week.id, titulo: `Deck ${i}`, estatus: 'done', estimadoMin: 60, tipoTrabajo: 'deck' },
      })
      await prisma.timeEntry.create({
        data: { userId: user.id, taskId: t.id, startedAt: new Date('2026-07-06T09:00:00Z'), stoppedAt: new Date('2026-07-06T10:00:00Z'), seconds: 3600 },
      })
    }
    const base = (await factorPorClase(user.id)).deck

    const delegada = await prisma.task.create({
      data: { userId: user.id, weekId: week.id, titulo: 'Deck delegado', estatus: 'planned', estimadoMin: 600, tipoTrabajo: 'deck' },
    })
    await delegarTarea(delegada.id, user.id, 'Mike')

    const despues = (await factorPorClase(user.id)).deck
    expect(despues.muestras).toBe(base.muestras)
    expect(despues.factor).toBe(base.factor)
  })

  it('no deja delegar la tarea de otro usuario', async () => {
    const { task } = await setup()
    await expect(delegarTarea(task.id, 'otro-usuario', 'Mike')).rejects.toThrow()
  })
})

describe('deshacerDelegacion', () => {
  it('la regresa a planeada y su carga vuelve a contar', async () => {
    const { user, task } = await setup()
    await delegarTarea(task.id, user.id, 'Mike')

    await deshacerDelegacion(task.id, user.id)

    const t = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(t.estatus).toBe('planned')
    expect(t.delegadoA).toBeNull()

    const vista = await getDiaView(user.id, '2026-W28', '2026-07-06', '2026-07-06')
    expect(vista.planeadoMin).toBe(84)
  })
})
