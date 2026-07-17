import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { buildStatusContext } from '@/lib/ai/status-context'
import { deleteTestUser } from './helpers/cleanup'

const TEST_EMAIL = 'test-status-context@vp.mx'

beforeEach(() => deleteTestUser(TEST_EMAIL))

async function seedUserAndProject() {
  const user = await prisma.user.create({
    data: { email: TEST_EMAIL, nombre: 'Mau Gonzalez', passwordHash: 'x' },
  })
  const project = await prisma.project.create({
    data: { userId: user.id, nombre: 'Liverpool ET', cliente: 'Liverpool' },
  })
  return { user, project }
}

describe('buildStatusContext — rangoDesde y statusAnterior', () => {
  it('sin status previo: rangoDesde ~14 días atrás y statusAnterior null', async () => {
    const { user, project } = await seedUserAndProject()

    const antes = Date.now()
    const ctx = await buildStatusContext(user.id, project.id)
    const despues = Date.now()

    expect(ctx.statusAnterior).toBeNull()
    const rangoDesdeMs = new Date(ctx.rangoDesde).getTime()
    const esperadoMin = antes - 14 * 24 * 60 * 60 * 1000
    const esperadoMax = despues - 14 * 24 * 60 * 60 * 1000
    // tolerancia de minutos
    expect(rangoDesdeMs).toBeGreaterThanOrEqual(esperadoMin - 5 * 60 * 1000)
    expect(rangoDesdeMs).toBeLessThanOrEqual(esperadoMax + 5 * 60 * 1000)
  })

  it('con un Artifact previo en estado enviado: rangoDesde = su createdAt, statusAnterior = su final', async () => {
    const { user, project } = await seedUserAndProject()

    const previo = await prisma.artifact.create({
      data: {
        userId: user.id,
        projectId: project.id,
        tipo: 'status_equipo',
        insumos: {},
        borrador: 'borrador previo',
        final: 'texto final previo',
        estado: 'enviado',
        modelo: 'claude-sonnet-5',
        promptVersion: 'v1',
      },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    expect(ctx.statusAnterior).toBe('texto final previo')
    expect(ctx.rangoDesde).toBe(previo.createdAt.toISOString())
  })

  it('un Artifact en estado borrador NO cuenta como status previo', async () => {
    const { user, project } = await seedUserAndProject()

    await prisma.artifact.create({
      data: {
        userId: user.id,
        projectId: project.id,
        tipo: 'status_equipo',
        insumos: {},
        borrador: 'borrador sin tocar',
        estado: 'borrador',
        modelo: 'claude-sonnet-5',
        promptVersion: 'v1',
      },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    expect(ctx.statusAnterior).toBeNull()
    // debió caer al fallback de 14 días, no al createdAt del artifact borrador
    const rangoDesdeMs = new Date(ctx.rangoDesde).getTime()
    const catorceDiasMs = 14 * 24 * 60 * 60 * 1000
    expect(Date.now() - rangoDesdeMs).toBeGreaterThanOrEqual(catorceDiasMs - 5 * 60 * 1000)
  })
})

describe('buildStatusContext — avances', () => {
  it('filtra tasks done con updatedAt >= rangoDesde, incluye dodItems done', async () => {
    const { user, project } = await seedUserAndProject()

    const previo = await prisma.artifact.create({
      data: {
        userId: user.id,
        projectId: project.id,
        tipo: 'status_equipo',
        insumos: {},
        borrador: 'x',
        final: 'x',
        estado: 'enviado',
        modelo: 'claude-sonnet-5',
        promptVersion: 'v1',
      },
    })

    // Task done ANTES del rango — no debe aparecer.
    const taskVieja = await prisma.task.create({
      data: { userId: user.id, projectId: project.id, titulo: 'Vieja', estatus: 'done' },
    })
    await prisma.task.update({
      where: { id: taskVieja.id },
      data: { updatedAt: new Date(previo.createdAt.getTime() - 60 * 60 * 1000) },
    })

    // Task done DESPUÉS del rango — sí debe aparecer, con su dodItem done.
    const taskNueva = await prisma.task.create({
      data: { userId: user.id, projectId: project.id, titulo: 'Actualizar KPIs', estatus: 'done' },
    })
    await prisma.dodItem.create({ data: { taskId: taskNueva.id, texto: 'Correr forecast', done: true } })
    await prisma.dodItem.create({ data: { taskId: taskNueva.id, texto: 'Sin terminar', done: false } })

    const ctx = await buildStatusContext(user.id, project.id)

    const titulos = ctx.avances.map((a) => a.titulo)
    expect(titulos).toContain('Actualizar KPIs')
    expect(titulos).not.toContain('Vieja')

    const avanceNuevo = ctx.avances.find((a) => a.titulo === 'Actualizar KPIs')!
    expect(avanceNuevo.dodItems).toHaveLength(1)
    expect(avanceNuevo.dodItems[0].texto).toBe('Correr forecast')
  })
})

describe('buildStatusContext — en curso / planeado', () => {
  it('sin semana activa: lista vacía', async () => {
    const { user, project } = await seedUserAndProject()
    await prisma.week.create({
      data: {
        userId: user.id,
        isoWeek: '2026-W28',
        rangoInicio: new Date('2026-07-06'),
        rangoFin: new Date('2026-07-12'),
        factorUsado: 1.4,
        estatus: 'closed',
      },
    })
    await prisma.task.create({
      data: { userId: user.id, projectId: project.id, titulo: 'En curso sin semana activa', estatus: 'in_progress' },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    expect(ctx.enCurso).toEqual([])
  })

  it('con semana activa: incluye in_progress y planned con sus bloques', async () => {
    const { user, project } = await seedUserAndProject()
    const semana = await prisma.week.create({
      data: {
        userId: user.id,
        isoWeek: '2026-W29',
        rangoInicio: new Date('2026-07-13'),
        rangoFin: new Date('2026-07-19'),
        factorUsado: 1.4,
        estatus: 'active',
      },
    })

    const tareaEnCurso = await prisma.task.create({
      data: {
        userId: user.id,
        projectId: project.id,
        weekId: semana.id,
        titulo: 'Tarifas Spot/Dedicados',
        estatus: 'in_progress',
      },
    })
    await prisma.block.create({
      data: {
        weekId: semana.id,
        taskId: tareaEnCurso.id,
        fecha: new Date('2026-07-16'),
        inicio: '11:00',
        fin: '12:00',
        tipo: 'junta',
        titulo: 'Revisar tarifas',
        planMin: 60,
      },
    })

    const tareaPlaneada = await prisma.task.create({
      data: { userId: user.id, projectId: project.id, weekId: semana.id, titulo: 'Visitas a CRs', estatus: 'planned' },
    })

    // No debe aparecer: backlog en la misma semana.
    await prisma.task.create({
      data: { userId: user.id, projectId: project.id, weekId: semana.id, titulo: 'Backlog', estatus: 'backlog' },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    const titulos = ctx.enCurso.map((t) => t.titulo)
    expect(titulos).toContain('Tarifas Spot/Dedicados')
    expect(titulos).toContain('Visitas a CRs')
    expect(titulos).not.toContain('Backlog')

    const conBloque = ctx.enCurso.find((t) => t.id === tareaEnCurso.id)!
    expect(conBloque.bloques).toHaveLength(1)
    expect(conBloque.bloques[0].inicio).toBe('11:00')
    expect(conBloque.bloques[0].fin).toBe('12:00')

    const sinBloque = ctx.enCurso.find((t) => t.id === tareaPlaneada.id)!
    expect(sinBloque.bloques).toEqual([])
  })
})

describe('buildStatusContext — minutas nuevas', () => {
  it('incluye minutas con TODOS sus items, convertidos incluidos', async () => {
    const { user, project } = await seedUserAndProject()

    const minuta = await prisma.minuta.create({
      data: {
        userId: user.id,
        projectId: project.id,
        fecha: new Date(),
        titulo: 'Status Liverpool',
        asistentes: ['Carlos', 'Alan'],
      },
    })
    await prisma.minutaItem.create({
      data: { minutaId: minuta.id, tipo: 'acuerdo', texto: 'Foco en paquetes', estado: 'abierto' },
    })
    const task = await prisma.task.create({
      data: { userId: user.id, projectId: project.id, titulo: 'Actualizar KPIs', estatus: 'backlog' },
    })
    await prisma.minutaItem.create({
      data: {
        minutaId: minuta.id,
        tipo: 'pendiente_nuestro',
        texto: 'Actualizar KPIs',
        estado: 'convertido',
        taskId: task.id,
      },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    expect(ctx.minutasNuevas).toHaveLength(1)
    expect(ctx.minutasNuevas[0].items).toHaveLength(2)
    const estados = ctx.minutasNuevas[0].items.map((i) => i.estado)
    expect(estados).toContain('convertido')
    expect(estados).toContain('abierto')
  })
})

describe('buildStatusContext — issues / RAID', () => {
  it('issues cerrados no vienen; abiertos sí con sus campos de seguimiento', async () => {
    const { user, project } = await seedUserAndProject()

    await prisma.issue.create({
      data: { projectId: project.id, tipo: 'pendiente', descripcion: 'Ya resuelto', estatus: 'cerrado' },
    })
    const abierto = await prisma.issue.create({
      data: {
        projectId: project.id,
        tipo: 'pendiente',
        descripcion: 'Sigue sin respuesta de Mario',
        responsable: 'Mario',
        fechaCompromiso: new Date('2026-07-20'),
        ultimoSeguimiento: new Date('2026-07-14'),
        numSeguimientos: 3,
        estatus: 'abierto',
      },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    expect(ctx.esperas).toHaveLength(1)
    expect(ctx.esperas[0].id).toBe(abierto.id)
    expect(ctx.esperas[0].responsable).toBe('Mario')
    expect(ctx.esperas[0].numSeguimientos).toBe(3)
    expect(ctx.esperas[0].ultimoSeguimiento).toBe(new Date('2026-07-14').toISOString())
  })
})

describe('buildStatusContext — whitelist', () => {
  it('contiene responsables + asistentes + nombre de usuario y proyecto/cliente, sin duplicados', async () => {
    const { user, project } = await seedUserAndProject()

    await prisma.issue.create({
      data: {
        projectId: project.id,
        tipo: 'pendiente',
        descripcion: 'x',
        responsable: 'Mario',
        estatus: 'abierto',
      },
    })
    const minuta = await prisma.minuta.create({
      data: { userId: user.id, projectId: project.id, fecha: new Date(), titulo: 'Status', asistentes: ['Carlos', 'Mario'] },
    })
    await prisma.minutaItem.create({
      data: { minutaId: minuta.id, tipo: 'pendiente_cliente', texto: 'x', responsable: 'Mario', estado: 'abierto' },
    })

    const ctx = await buildStatusContext(user.id, project.id)

    expect(ctx.whitelist).toContain('Mau Gonzalez')
    expect(ctx.whitelist).toContain('Liverpool ET')
    expect(ctx.whitelist).toContain('Liverpool')
    expect(ctx.whitelist).toContain('Carlos')
    expect(ctx.whitelist).toContain('Mario')
    // 'Mario' aparece en issue, asistentes y responsable de item — solo una vez
    expect(ctx.whitelist.filter((n) => n === 'Mario')).toHaveLength(1)
  })
})

describe('buildStatusContext — ownership y serializabilidad', () => {
  it('rechaza un proyecto que no pertenece al usuario', async () => {
    const { user } = await seedUserAndProject()
    const otro = await prisma.user.create({ data: { email: 'otro-status-context@vp.mx', nombre: 'Otro', passwordHash: 'x' } })
    const ajeno = await prisma.project.create({ data: { userId: otro.id, nombre: 'Ajeno' } })

    await expect(buildStatusContext(user.id, ajeno.id)).rejects.toThrow()

    await prisma.project.deleteMany({ where: { userId: otro.id } })
    await prisma.user.delete({ where: { id: otro.id } })
  })

  it('el resultado es serializable sin pérdida esencial', async () => {
    const { user, project } = await seedUserAndProject()
    await prisma.issue.create({
      data: {
        projectId: project.id,
        tipo: 'riesgo',
        descripcion: 'x',
        responsable: 'Mario',
        fechaCompromiso: new Date('2026-07-20'),
        estatus: 'abierto',
      },
    })

    const ctx = await buildStatusContext(user.id, project.id)
    const roundtrip = JSON.parse(JSON.stringify(ctx))

    expect(roundtrip).toEqual(ctx)
    expect(typeof roundtrip.rangoDesde).toBe('string')
    expect(typeof roundtrip.esperas[0].fechaCompromiso).toBe('string')
  })
})
