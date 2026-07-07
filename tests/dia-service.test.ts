import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import {
  getDayBlocks,
  toggleDodItem,
  markTaskDone,
  undoTaskDone,
  markBlockDone,
  undoBlockDone,
} from '@/app/dia/service'
import { startTimer, stopTimer } from '@/app/api/v1/timer/service'

const TEST_EMAIL = 'test-dia@vp.mx'
const TODAY = '2026-07-07'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function setupDay() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
  const week = await prisma.week.create({
    data: {
      userId: user.id,
      isoWeek: '2026-W28',
      rangoInicio: new Date('2026-07-06'),
      rangoFin: new Date('2026-07-10'),
      factorUsado: 1.4,
    },
  })
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      titulo: 'KPIs región 1',
      estatus: 'planned',
      dodItems: { create: [{ texto: 'región cerrada', orden: 0 }] },
    },
  })
  const block = await prisma.block.create({
    data: {
      weekId: week.id,
      taskId: task.id,
      fecha: new Date(TODAY),
      inicio: '09:00',
      fin: '12:00',
      tipo: 'tarea',
      titulo: 'KPIs región 1',
      planMin: 180,
    },
  })
  const junta = await prisma.block.create({
    data: {
      weekId: week.id,
      fecha: new Date(TODAY),
      inicio: '17:00',
      fin: '18:00',
      tipo: 'junta',
      titulo: 'Revisión BD',
      planMin: 60,
      orden: 1,
    },
  })
  return { user, task, block, junta }
}

describe('getDayBlocks', () => {
  it('devuelve los bloques del día ordenados con su tarea y dod', async () => {
    const { user } = await setupDay()
    const blocks = await getDayBlocks(user.id, TODAY)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].tipo).toBe('tarea')
    expect(blocks[0].dodItems).toEqual([{ id: expect.any(String), texto: 'región cerrada', done: false }])
    expect(blocks[1].tipo).toBe('junta')
    expect(blocks[1].dodItems).toEqual([])
  })

  it('no incluye bloques de otro día', async () => {
    const { user } = await setupDay()
    const blocks = await getDayBlocks(user.id, '2026-07-08')
    expect(blocks).toHaveLength(0)
  })

  it('refleja segundos acumulados de TimeEntries cerradas', async () => {
    const { user, task } = await setupDay()
    const entry = await startTimer(user.id, task.id)
    await prisma.timeEntry.update({ where: { id: entry.id }, data: { startedAt: new Date(Date.now() - 42_000) } })
    await stopTimer(user.id)
    const blocks = await getDayBlocks(user.id, TODAY)
    expect(blocks[0].accumulatedSeconds).toBeGreaterThanOrEqual(42)
    expect(blocks[0].runningSince).toBeNull()
  })

  it('marca runningSince si el timer de esa tarea está corriendo ahora', async () => {
    const { user, task } = await setupDay()
    await startTimer(user.id, task.id)
    const blocks = await getDayBlocks(user.id, TODAY)
    expect(blocks[0].runningSince).not.toBeNull()
  })

  it('done de un bloque tipo tarea viene del estatus de la Task, no de Block.done', async () => {
    const { user, task } = await setupDay()
    await prisma.task.update({ where: { id: task.id }, data: { estatus: 'done' } })
    const blocks = await getDayBlocks(user.id, TODAY)
    expect(blocks[0].done).toBe(true)
  })
})

describe('toggleDodItem', () => {
  it('alterna done y devuelve el item actualizado', async () => {
    const { user, task } = await setupDay()
    const dod = await prisma.dodItem.findFirstOrThrow({ where: { taskId: task.id } })
    const updated = await toggleDodItem(dod.id, user.id)
    expect(updated.done).toBe(true)
  })

  it('lanza si el dodItem no pertenece al usuario', async () => {
    const { task } = await setupDay()
    const dod = await prisma.dodItem.findFirstOrThrow({ where: { taskId: task.id } })
    await expect(toggleDodItem(dod.id, 'otro-usuario-id')).rejects.toThrow()
  })
})

describe('markTaskDone / undoTaskDone', () => {
  it('marca done y detiene el timer si estaba corriendo', async () => {
    const { user, task } = await setupDay()
    await startTimer(user.id, task.id)
    await markTaskDone(task.id, user.id)
    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(updated.estatus).toBe('done')
    expect(await prisma.timeEntry.findFirst({ where: { taskId: task.id, stoppedAt: null } })).toBeNull()
  })

  it('undoTaskDone regresa a in_progress si ya tiene tiempo registrado', async () => {
    const { user, task } = await setupDay()
    await startTimer(user.id, task.id)
    await markTaskDone(task.id, user.id)
    await undoTaskDone(task.id, user.id)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).estatus).toBe('in_progress')
  })

  it('undoTaskDone regresa a planned si nunca se cronometró', async () => {
    const { user, task } = await setupDay()
    await prisma.task.update({ where: { id: task.id }, data: { estatus: 'done' } })
    await undoTaskDone(task.id, user.id)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).estatus).toBe('planned')
  })
})

describe('markBlockDone / undoBlockDone', () => {
  it('marca y desmarca un bloque sin tarea (junta)', async () => {
    const { user, junta } = await setupDay()
    await markBlockDone(junta.id, user.id)
    expect((await prisma.block.findUniqueOrThrow({ where: { id: junta.id } })).done).toBe(true)
    await undoBlockDone(junta.id, user.id)
    expect((await prisma.block.findUniqueOrThrow({ where: { id: junta.id } })).done).toBe(false)
  })

  it('rechaza marcar done un bloque tipo tarea (debe usar markTaskDone)', async () => {
    const { user, block } = await setupDay()
    await expect(markBlockDone(block.id, user.id)).rejects.toThrow()
  })
})
