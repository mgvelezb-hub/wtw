import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { crearActividadDelDia } from '@/app/(app)/dia/nueva-actividad'
import { deleteTestUser } from './helpers/cleanup'

// Capturar una actividad exigía salir a /inbox y volver. Cuando algo cae a media
// mañana —una junta que suelta trabajo, un pendiente que aparece— salir del día
// es justo lo que hace que no se registre, y lo que no se registra no entra en
// la carga contra la que se mide el sobre-compromiso.
const TEST_EMAIL = 'test-nueva-act@vp.mx'

async function setup() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'T', passwordHash: 'x' } })
  const week = await prisma.week.create({
    data: {
      userId: user.id,
      isoWeek: '2026-W28',
      rangoInicio: new Date('2026-07-06'),
      rangoFin: new Date('2026-07-10'),
      factorUsado: 1.4,
    },
  })
  const win = await prisma.win.create({
    data: { weekId: week.id, posicion: 1, titulo: 'Business Case entregado' },
  })
  const project = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool' } })
  return { user, week, win, project }
}

beforeEach(() => deleteTestUser(TEST_EMAIL))

describe('crearActividadDelDia', () => {
  it('crea la tarea con su win, proyecto y herramienta, y la agenda en el día', async () => {
    const { user, week, win, project } = await setup()

    const { task, block } = await crearActividadDelDia(user.id, {
      titulo: 'Preparar respaldo de escenarios',
      fecha: '2026-07-07',
      projectId: project.id,
      winId: win.id,
      herramienta: 'Excel',
      tipoTrabajo: 'analisis',
      estimadoMin: 60,
      agendar: true,
    })

    expect(task.titulo).toBe('Preparar respaldo de escenarios')
    expect(task.winId).toBe(win.id)
    expect(task.projectId).toBe(project.id)
    expect(task.herramienta).toBe('Excel')
    expect(task.tipoTrabajo).toBe('analisis')
    expect(task.weekId).toBe(week.id)
    expect(task.estatus).toBe('planned')
    expect(block).not.toBeNull()
    expect(block!.fecha.toISOString().slice(0, 10)).toBe('2026-07-07')
  })

  // El factor no es decoración: es el mecanismo contra la brecha #1 del 360.
  // Una actividad capturada a mano sin inflar entra al día mintiendo sobre lo
  // que va a costar.
  it('aplica el factor de realismo de la semana al estimado', async () => {
    const { user, win, project } = await setup()

    const { task } = await crearActividadDelDia(user.id, {
      titulo: 'Ajustes al deck',
      fecha: '2026-07-07',
      projectId: project.id,
      winId: win.id,
      estimadoMin: 60,
      agendar: true,
    })

    expect(task.ajustadoMin).toBe(84) // 60 × 1.4
  })

  it('el bloque nace con los minutos AJUSTADOS, no con el estimado crudo', async () => {
    const { user } = await setup()

    const { block } = await crearActividadDelDia(user.id, {
      titulo: 'Revisar output de Alex',
      fecha: '2026-07-07',
      estimadoMin: 30,
      agendar: true,
    })

    expect(block!.planMin).toBe(42) // 30 × 1.4
  })

  it('sin agendar se queda en pendientes: sin bloque y sin día', async () => {
    const { user } = await setup()

    const { task, block } = await crearActividadDelDia(user.id, {
      titulo: 'Algo que todavía no tiene día',
      fecha: '2026-07-07',
      estimadoMin: 45,
      agendar: false,
    })

    expect(block).toBeNull()
    expect(task.estatus).toBe('backlog')
  })

  it('sin estimado no inventa duración: el bloque es flex sin minutos', async () => {
    const { user } = await setup()

    const { task, block } = await crearActividadDelDia(user.id, {
      titulo: 'Sin estimar todavía',
      fecha: '2026-07-07',
      agendar: true,
    })

    expect(task.estimadoMin).toBeNull()
    expect(task.ajustadoMin).toBeNull()
    expect(block!.planMin).toBe(0)
  })

  it('rechaza título vacío', async () => {
    const { user } = await setup()
    await expect(crearActividadDelDia(user.id, { titulo: '   ', fecha: '2026-07-07', agendar: true })).rejects.toThrow()
  })

  it('no deja colgar la actividad de un Win de otro usuario', async () => {
    const { user } = await setup()
    const otro = await prisma.user.create({ data: { email: 'test-nueva-act-otro@vp.mx', nombre: 'O', passwordHash: 'x' } })
    const weekOtro = await prisma.week.create({
      data: { userId: otro.id, isoWeek: '2026-W28', rangoInicio: new Date('2026-07-06'), rangoFin: new Date('2026-07-10'), factorUsado: 1.4 },
    })
    const winAjeno = await prisma.win.create({ data: { weekId: weekOtro.id, posicion: 1, titulo: 'Ajeno' } })

    await expect(
      crearActividadDelDia(user.id, { titulo: 'Intento', fecha: '2026-07-07', winId: winAjeno.id, agendar: true })
    ).rejects.toThrow()

    await deleteTestUser('test-nueva-act-otro@vp.mx')
  })
})
