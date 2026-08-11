import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ensamblarResumen, renderContexto } from '@/app/(app)/resumen/service'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-resumen@vp.mx'
beforeEach(() => deleteTestUser(TEST_EMAIL))

async function escenario() {
  const user = await prisma.user.create({ data: { email: TEST_EMAIL, nombre: 'Test', passwordHash: 'x' } })
  const proyecto = await prisma.project.create({ data: { userId: user.id, nombre: 'Liverpool Test' } })
  const otro = await prisma.project.create({ data: { userId: user.id, nombre: 'Otro Proyecto' } })

  const minuta = await prisma.minuta.create({
    data: {
      userId: user.id,
      projectId: proyecto.id,
      fecha: new Date('2026-08-05'),
      titulo: 'Ferman',
      asistentes: ['Carlos Sierra', 'Rafael Velázquez'],
      items: {
        create: [
          { tipo: 'acuerdo', texto: 'Aceptan la reducción de tarifa', orden: 0 },
          { tipo: 'pendiente_cliente', texto: 'Cotizar Dedicado GDL', responsable: 'Ferman', fechaCompromiso: new Date('2026-08-20'), orden: 1 },
        ],
      },
    },
  })
  // Minuta de otro proyecto y fuera de rango — sirve para probar los filtros.
  await prisma.minuta.create({
    data: { userId: user.id, projectId: otro.id, fecha: new Date('2026-07-01'), titulo: 'Vieja', asistentes: [] },
  })

  const semana = await prisma.week.create({
    data: { userId: user.id, isoWeek: '2026-W32', rangoInicio: new Date('2026-08-03'), rangoFin: new Date('2026-08-09'), factorUsado: 1.4 },
  })
  const abierta = await prisma.task.create({
    data: { userId: user.id, projectId: proyecto.id, weekId: semana.id, titulo: 'Analizar tarifas', estatus: 'planned', deadline: new Date('2026-08-15') },
  })
  await prisma.block.create({
    data: { weekId: semana.id, taskId: abierta.id, fecha: new Date('2026-08-05'), inicio: 'flex', fin: 'flex', tipo: 'tarea', titulo: 'Analizar tarifas', planMin: 60 },
  })
  // Terminada: no debe aparecer en "trabajo vivo".
  await prisma.task.create({
    data: { userId: user.id, projectId: proyecto.id, titulo: 'Ya cerrada', estatus: 'done' },
  })
  await prisma.issue.create({
    data: { projectId: proyecto.id, tipo: 'riesgo', descripcion: 'Flota al límite en el centro', estatus: 'abierto' },
  })
  await prisma.deliverable.create({
    data: { projectId: proyecto.id, nombre: 'Dashboard de negociaciones', estatus: 'borrador', avancePct: 40, fechaComprometida: new Date('2026-08-30') },
  })

  return { user, proyecto, otro, minuta }
}

describe('ensamblarResumen', () => {
  it('alcance junta: se queda en esa sesión y no arrastra el trabajo del proyecto', async () => {
    const { user, minuta } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'junta', minutaId: minuta.id })

    expect(ctx.minutas).toHaveLength(1)
    expect(ctx.minutas[0].titulo).toBe('Ferman')
    expect(ctx.minutas[0].items).toHaveLength(2)
    // Meter todo lo abierto ahogaría lo que pasó en la junta.
    expect(ctx.tareas).toHaveLength(0)
    expect(ctx.issues).toHaveLength(0)
    expect(ctx.entregables).toHaveLength(0)
  })

  it('alcance proyecto: cruza minutas con el trabajo vivo, y excluye lo terminado', async () => {
    const { user, proyecto } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'proyecto', projectId: proyecto.id })

    expect(ctx.minutas.map((m) => m.titulo)).toEqual(['Ferman'])
    expect(ctx.tareas.map((t) => t.titulo)).toEqual(['Analizar tarifas'])
    expect(ctx.issues).toHaveLength(1)
    expect(ctx.entregables).toHaveLength(1)
  })

  it('alcance proyecto: no mezcla datos de otro proyecto', async () => {
    const { user, proyecto } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'proyecto', projectId: proyecto.id })
    expect(ctx.minutas.some((m) => m.titulo === 'Vieja')).toBe(false)
  })

  it('alcance periodo: filtra por ventana de fechas', async () => {
    const { user } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'periodo', desde: '2026-08-01', hasta: '2026-08-31' })

    expect(ctx.minutas.map((m) => m.titulo)).toEqual(['Ferman'])
    expect(ctx.minutas.some((m) => m.titulo === 'Vieja')).toBe(false)
  })

  it('alcance día: incluye la tarea por su bloque agendado ese día', async () => {
    const { user } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'dia', fecha: '2026-08-05' })

    expect(ctx.minutas).toHaveLength(1)
    expect(ctx.tareas.map((t) => t.titulo)).toEqual(['Analizar tarifas'])
  })

  it('alcance día sin nada agendado devuelve vacío, no un resumen inventado', async () => {
    const { user } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'dia', fecha: '2026-08-25' })
    expect(ctx.vacio).toBe(true)
  })

  it('alcance semana: resuelve el rango ISO', async () => {
    const { user } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'semana', isoWeek: '2026-W32' })

    expect(ctx.desde).toBe('2026-08-03')
    // weekRange devuelve la jornada laboral: lunes a viernes, no la semana calendario.
    expect(ctx.hasta).toBe('2026-08-07')
    expect(ctx.minutas).toHaveLength(1)
  })

  it('alcance global: trae todo lo abierto de todos los proyectos', async () => {
    const { user } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'global' })

    expect(ctx.minutas).toHaveLength(2)
    expect(ctx.tareas).toHaveLength(1)
    expect(ctx.vacio).toBe(false)
  })

  it('no filtra datos de otro usuario', async () => {
    const { user } = await escenario()
    const otroUser = await prisma.user.create({ data: { email: 'test-resumen-otro@vp.mx', nombre: 'O', passwordHash: 'x' } })
    const p = await prisma.project.create({ data: { userId: otroUser.id, nombre: 'Ajeno' } })
    await prisma.minuta.create({ data: { userId: otroUser.id, projectId: p.id, fecha: new Date('2026-08-05'), titulo: 'Ajena', asistentes: [] } })

    const ctx = await ensamblarResumen(user.id, { tipo: 'global' })
    expect(ctx.minutas.some((m) => m.titulo === 'Ajena')).toBe(false)

    await prisma.minuta.deleteMany({ where: { userId: otroUser.id } })
    await prisma.project.deleteMany({ where: { userId: otroUser.id } })
    await prisma.user.delete({ where: { id: otroUser.id } })
  })

  it('registra los insumos usados, para poder auditar el resumen después', async () => {
    const { user, proyecto, minuta } = await escenario()
    const ctx = await ensamblarResumen(user.id, { tipo: 'proyecto', projectId: proyecto.id })

    expect(ctx.insumos.minutaIds).toContain(minuta.id)
    expect(ctx.insumos.taskIds).toHaveLength(1)
    expect(ctx.insumos.issueIds).toHaveLength(1)
    expect(ctx.insumos.entregableIds).toHaveLength(1)
  })
})

describe('renderContexto', () => {
  it('incluye las cuatro fuentes con sus datos clave', async () => {
    const { user, proyecto } = await escenario()
    const txt = renderContexto(await ensamblarResumen(user.id, { tipo: 'proyecto', projectId: proyecto.id }))

    expect(txt).toContain('MINUTAS CAPTURADAS')
    expect(txt).toContain('Aceptan la reducción de tarifa')
    expect(txt).toContain('resp: Ferman')
    expect(txt).toContain('fecha: 2026-08-20')
    expect(txt).toContain('TAREAS ABIERTAS')
    expect(txt).toContain('deadline 2026-08-15')
    expect(txt).toContain('ISSUES ABIERTOS')
    expect(txt).toContain('ENTREGABLES SIN ACEPTAR')
  })

  it('marca explícitamente las tareas sin tiempo registrado', async () => {
    const { user, proyecto } = await escenario()
    const txt = renderContexto(await ensamblarResumen(user.id, { tipo: 'proyecto', projectId: proyecto.id }))
    // El modelo tiene que poder decir "esto no se midió" en vez de asumir cero.
    expect(txt).toContain('sin tiempo registrado')
  })

  it('omite las secciones vacías en vez de imprimir encabezados huecos', async () => {
    const { user, minuta } = await escenario()
    const txt = renderContexto(await ensamblarResumen(user.id, { tipo: 'junta', minutaId: minuta.id }))

    expect(txt).toContain('MINUTAS CAPTURADAS')
    expect(txt).not.toContain('TAREAS ABIERTAS')
    expect(txt).not.toContain('ISSUES ABIERTOS')
  })
})
