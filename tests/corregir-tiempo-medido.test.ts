import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setMeasuredMinutes } from '@/app/(app)/dia/service'
import { deleteTestUser } from './helpers/cleanup'

// Un cronómetro olvidado es indistinguible de trabajo real para la app: en un
// solo día, dos tramos de Mau midieron 466 y 231 minutos de trabajo que duró 96
// y 61. Corregirlos exigió entrar por la base de datos porque la UI no ofrecía
// forma de tocar el tiempo medido de una tarea YA TERMINADA — justo el momento
// en que uno se da cuenta del error.
const TEST_EMAIL = 'test-corregir-medido@vp.mx'

async function setup() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
  const task = await prisma.task.create({ data: { userId: user.id, titulo: 'GATE: paquetes', estatus: 'done' } })
  return { user, task }
}

async function entry(userId: string, taskId: string, inicio: string, minutos: number) {
  const startedAt = new Date(inicio)
  return prisma.timeEntry.create({
    data: {
      userId,
      taskId,
      startedAt,
      stoppedAt: new Date(startedAt.getTime() + minutos * 60_000),
      seconds: minutos * 60,
    },
  })
}

beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('setMeasuredMinutes', () => {
  it('corrige el tramo único y mueve stoppedAt para que el registro no se contradiga', async () => {
    const { user, task } = await setup()
    const e = await entry(user.id, task.id, '2026-08-25T12:58:40-06:00', 231)

    await setMeasuredMinutes(task.id, user.id, 61 * 60)

    const despues = await prisma.timeEntry.findUniqueOrThrow({ where: { id: e.id } })
    expect(despues.seconds).toBe(61 * 60)
    // El defecto que tenía editEntry: cambiaba seconds y dejaba stoppedAt en su
    // hora vieja, así que el registro decía 231 min de reloj y 61 de duración.
    expect(despues.stoppedAt!.getTime() - despues.startedAt.getTime()).toBe(61 * 60_000)
    // startedAt NO se toca: el arranque del cronómetro sí fue real, y de él
    // depende que el tramo cuente como fuera de jornada.
    expect(despues.startedAt.toISOString()).toBe(e.startedAt.toISOString())
    expect(despues.manual).toBe(true)
  })

  it('funciona con la tarea terminada — que es cuando uno se da cuenta', async () => {
    const { user, task } = await setup()
    await entry(user.id, task.id, '2026-08-25T01:08:13-06:00', 466)

    await setMeasuredMinutes(task.id, user.id, 96 * 60)

    const t = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { timeEntries: true } })
    expect(t.estatus).toBe('done')
    expect(t.timeEntries.reduce((s, e) => s + e.seconds, 0)).toBe(96 * 60)
  })

  it('con varios tramos ajusta el último para que el TOTAL cuadre', async () => {
    const { user, task } = await setup()
    await entry(user.id, task.id, '2026-08-25T09:00:00-06:00', 30)
    const ultimo = await entry(user.id, task.id, '2026-08-25T12:58:40-06:00', 231)

    await setMeasuredMinutes(task.id, user.id, 91 * 60) // 30 previos + 61

    const t = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { timeEntries: true } })
    expect(t.timeEntries.reduce((s, e) => s + e.seconds, 0)).toBe(91 * 60)
    const u = t.timeEntries.find((e) => e.id === ultimo.id)!
    expect(u.seconds).toBe(61 * 60)
    // Los tramos anteriores quedan intactos: se corrige el olvidado, no se
    // reparte el error entre todos.
    expect(t.timeEntries.find((e) => e.id !== ultimo.id)!.seconds).toBe(30 * 60)
  })

  it('rechaza un total menor a lo que ya suman los tramos anteriores, y dice el mínimo', async () => {
    const { user, task } = await setup()
    await entry(user.id, task.id, '2026-08-25T09:00:00-06:00', 30)
    await entry(user.id, task.id, '2026-08-25T12:58:40-06:00', 231)

    await expect(setMeasuredMinutes(task.id, user.id, 10 * 60)).rejects.toThrow(/30/)
  })

  it('no toca un cronómetro corriendo — se para primero', async () => {
    const { user, task } = await setup()
    await prisma.timeEntry.create({
      data: { userId: user.id, taskId: task.id, startedAt: new Date('2026-08-25T12:00:00-06:00'), stoppedAt: null, seconds: 0 },
    })

    await expect(setMeasuredMinutes(task.id, user.id, 60 * 60)).rejects.toThrow(/corriendo/i)
  })

  it('rechaza tiempo negativo', async () => {
    const { user, task } = await setup()
    await entry(user.id, task.id, '2026-08-25T12:00:00-06:00', 60)

    await expect(setMeasuredMinutes(task.id, user.id, -60)).rejects.toThrow()
  })

  it('no deja tocar la tarea de otro usuario', async () => {
    const { user, task } = await setup()
    await entry(user.id, task.id, '2026-08-25T12:00:00-06:00', 60)

    await expect(setMeasuredMinutes(task.id, 'otro-usuario', 30 * 60)).rejects.toThrow()
  })
})
