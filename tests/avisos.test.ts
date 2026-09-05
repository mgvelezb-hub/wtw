import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { estadoAvisos, semanaPlaneada } from '@/lib/avisos'
import { planLocal, ID_CIERRE, ID_RITUAL } from '@/lib/avisos-locales'
import { RECORDATORIOS_DEFAULT } from '@/lib/push'
import { isoWeekAPlanear } from '@/lib/dates'
import { deleteTestUser } from './helpers/cleanup'

// El estado que alimenta los avisos locales del cascarón. Lo que importa: que
// "semana planeada" y "día con plan / cerrado" salgan de la misma definición
// que usa el cron del push web, y que planLocal los respete de punta a punta.

const TEST_EMAIL = 'test-avisos@vp.mx'
const MX = 'America/Mexico_City'
// Miércoles 9-sep-2026 09:00 CDMX.
const AHORA = new Date('2026-09-09T15:00:00.000Z')

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function usuario() {
  return prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
}

describe('estadoAvisos', () => {
  it('sin semana ni plan del día: pide ritual, no pide cierre', async () => {
    const u = await usuario()
    const estado = await estadoAvisos(u.id, MX, AHORA)
    expect(estado.hoy).toBe('2026-09-09')
    expect(estado.isoWeekAPlanear).toBe(isoWeekAPlanear(AHORA, 3))
    expect(estado.semanaPlaneada).toBe(false)
    expect(estado.diaConPlan).toBe(false)
    expect(estado.yaReconciliado).toBe(false)

    const ids = planLocal(RECORDATORIOS_DEFAULT, AHORA, MX, estado).map((a) => a.id)
    expect(ids).toContain(ID_RITUAL)
    expect(ids).not.toContain(ID_CIERRE)
  })

  it('un cascarón de semana sin wins ni tareas NO cuenta como planeada; con una tarea sí', async () => {
    const u = await usuario()
    const isoWeek = isoWeekAPlanear(AHORA, 3)
    const week = await prisma.week.create({
      data: { userId: u.id, isoWeek, rangoInicio: new Date('2026-09-14'), rangoFin: new Date('2026-09-20'), factorUsado: 1.4 },
    })
    expect(await semanaPlaneada(u.id, isoWeek)).toBe(false)
    await prisma.task.create({ data: { userId: u.id, weekId: week.id, titulo: 'Algo', estatus: 'planned' } })
    expect(await semanaPlaneada(u.id, isoWeek)).toBe(true)
    expect((await estadoAvisos(u.id, MX, AHORA)).semanaPlaneada).toBe(true)
  })

  it('con un bloque planeado hoy pide cierre; reconciliado, ya no', async () => {
    const u = await usuario()
    const week = await prisma.week.create({
      data: { userId: u.id, isoWeek: '2026-W37', rangoInicio: new Date('2026-09-07'), rangoFin: new Date('2026-09-13'), factorUsado: 1.4 },
    })
    const task = await prisma.task.create({ data: { userId: u.id, weekId: week.id, titulo: 'Deck', estatus: 'planned' } })
    await prisma.block.create({
      data: { weekId: week.id, taskId: task.id, fecha: new Date('2026-09-09'), inicio: '09:00', fin: '10:00', tipo: 'tarea', titulo: 'Deck', planMin: 60 },
    })
    let estado = await estadoAvisos(u.id, MX, AHORA)
    expect(estado.diaConPlan).toBe(true)
    expect(planLocal(RECORDATORIOS_DEFAULT, AHORA, MX, estado).map((a) => a.id)).toContain(ID_CIERRE)

    await prisma.dayReconciliation.create({ data: { userId: u.id, fecha: new Date('2026-09-09') } })
    estado = await estadoAvisos(u.id, MX, AHORA)
    expect(estado.yaReconciliado).toBe(true)
    expect(planLocal(RECORDATORIOS_DEFAULT, AHORA, MX, estado).map((a) => a.id)).not.toContain(ID_CIERRE)
  })
})
