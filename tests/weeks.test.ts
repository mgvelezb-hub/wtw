import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createWeekPayload, getWeek } from '@/app/api/v1/weeks/service'

async function cleanDb() {
  await prisma.$transaction([
    prisma.evidence.deleteMany(),
    prisma.timeEntry.deleteMany(),
    prisma.block.deleteMany(),
    prisma.dodItem.deleteMany(),
    prisma.task.deleteMany(),
    prisma.win.deleteMany(),
    prisma.week.deleteMany(),
    prisma.issue.deleteMany(),
    prisma.deliverable.deleteMany(),
    prisma.allocation.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany({ where: { email: 'test-weeks@vp.mx' } }),
  ])
}

beforeEach(cleanDb)

describe('createWeekPayload', () => {
  it('crea semana con wins, tasks con dod, y blocks ligados', async () => {
    const user = await prisma.user.create({
      data: { email: 'test-weeks@vp.mx', nombre: 'Test', passwordHash: 'x' },
    })

    const payload = {
      isoWeek: '2026-W28',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Data 2026', dod: 'supuestos acordados' }],
      tasks: [
        {
          ref: 't1',
          titulo: 'KPIs región 1',
          projectNombre: 'Liverpool',
          winPosicion: 1,
          estimadoMin: 180,
          dod: ['región cerrada'],
        },
      ],
      blocks: [
        {
          fecha: '2026-07-06',
          inicio: '09:00',
          fin: '12:00',
          tipo: 'tarea' as const,
          taskRef: 't1',
          titulo: 'KPIs región 1',
          planMin: 180,
        },
      ],
    }

    const week = await createWeekPayload(user.id, payload)

    const full = await prisma.week.findUnique({
      where: { id: week.id },
      include: { wins: true, tasks: { include: { dodItems: true } }, blocks: true },
    })

    expect(full!.wins).toHaveLength(1)
    expect(full!.tasks[0].estimadoMin).toBe(180)
    expect(full!.tasks[0].dodItems[0].texto).toBe('región cerrada')
    expect(full!.tasks[0].winId).toBe(full!.wins[0].id)
    expect(full!.blocks[0].taskId).toBe(full!.tasks[0].id)
    expect(full!.rangoInicio.toISOString().slice(0, 10)).toBe('2026-07-06')

    const project = await prisma.project.findFirst({ where: { userId: user.id, nombre: 'Liverpool' } })
    expect(full!.tasks[0].projectId).toBe(project!.id)
  })

  it('reutiliza un proyecto existente por nombre en vez de duplicarlo', async () => {
    const user = await prisma.user.create({
      data: { email: 'test-weeks@vp.mx', nombre: 'Test', passwordHash: 'x' },
    })
    const existing = await prisma.project.create({ data: { userId: user.id, nombre: 'Cuervo' } })

    await createWeekPayload(user.id, {
      isoWeek: '2026-W28',
      factorUsado: 1.4,
      wins: [],
      tasks: [{ ref: 't1', titulo: 'Prueba VM', projectNombre: 'Cuervo', estimadoMin: 60, dod: [] }],
      blocks: [],
    })

    const count = await prisma.project.count({ where: { userId: user.id, nombre: 'Cuervo' } })
    expect(count).toBe(1)
    const task = await prisma.task.findFirst({ where: { titulo: 'Prueba VM' } })
    expect(task!.projectId).toBe(existing.id)
  })

  it('rechaza semana duplicada por usuario', async () => {
    const user = await prisma.user.create({
      data: { email: 'test-weeks@vp.mx', nombre: 'Test', passwordHash: 'x' },
    })
    const payload = { isoWeek: '2026-W28', factorUsado: 1.4, wins: [], tasks: [], blocks: [] }
    await createWeekPayload(user.id, payload)
    await expect(createWeekPayload(user.id, payload)).rejects.toThrow()
  })
})

describe('getWeek', () => {
  it('devuelve null si el usuario no tiene esa semana', async () => {
    const user = await prisma.user.create({
      data: { email: 'test-weeks@vp.mx', nombre: 'Test', passwordHash: 'x' },
    })
    expect(await getWeek(user.id, '2026-W99')).toBeNull()
  })

  it('devuelve la semana completa ordenada', async () => {
    const user = await prisma.user.create({
      data: { email: 'test-weeks@vp.mx', nombre: 'Test', passwordHash: 'x' },
    })
    await createWeekPayload(user.id, {
      isoWeek: '2026-W28',
      factorUsado: 1.4,
      wins: [{ posicion: 1, titulo: 'Win 1' }],
      tasks: [{ ref: 't1', titulo: 'Tarea 1', estimadoMin: 30, dod: [] }],
      blocks: [{ fecha: '2026-07-06', inicio: '09:00', fin: '09:30', tipo: 'tarea', taskRef: 't1', titulo: 'Tarea 1', planMin: 30 }],
    })
    const week = await getWeek(user.id, '2026-W28')
    expect(week!.isoWeek).toBe('2026-W28')
    expect(week!.wins).toHaveLength(1)
    expect(week!.blocks).toHaveLength(1)
  })
})
