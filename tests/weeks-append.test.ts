import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { deleteTestUser } from './helpers/cleanup'
import { createWeekPayload, appendBlocks } from '@/app/api/v1/weeks/service'

const TEST_EMAIL = 'test-append@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('appendBlocks', () => {
  it('agrega tasks y blocks a una semana ya existente sin duplicarla', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    const week = await createWeekPayload(user.id, { isoWeek: '2026-W29', factorUsado: 1.4, wins: [], tasks: [], blocks: [] })

    await appendBlocks(user.id, '2026-W29', {
      tasks: [{ ref: 'x1', titulo: 'Tarea suelta', estimadoMin: 30, dod: [] }],
      blocks: [{ fecha: '2026-07-13', inicio: '10:00', fin: '10:30', tipo: 'tarea', taskRef: 'x1', titulo: 'Tarea suelta', planMin: 30 }],
    })

    const full = await prisma.week.findUnique({ where: { id: week.id }, include: { tasks: true, blocks: true } })
    expect(full!.tasks).toHaveLength(1)
    expect(full!.blocks).toHaveLength(1)
  })

  it('lanza si la semana no existe', async () => {
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
    await expect(appendBlocks(user.id, '2026-W99', { tasks: [], blocks: [] })).rejects.toThrow()
  })
})
