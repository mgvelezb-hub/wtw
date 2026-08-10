import { prisma } from '@/lib/prisma'
import { weekRange } from '@/lib/dates'
import type { Alcance, BlockType } from '@prisma/client'

type WinInput = { posicion: number; titulo: string; dod?: string }

type TaskInput = {
  ref: string
  titulo: string
  projectNombre?: string
  winPosicion?: number
  estimadoMin?: number
  ajustadoMin?: number
  deadline?: string
  alcance?: Alcance
  dolorCliente?: string
  dod?: string[]
}

type AdoptarInput = {
  id: string
  winPosicion?: number
  estimadoMin?: number
  ajustadoMin?: number
}

type BlockInput = {
  fecha: string
  inicio: string
  fin: string
  tipo: BlockType
  taskRef?: string
  titulo: string
  planMin: number
}

export type CreateWeekPayload = {
  isoWeek: string
  factorUsado: number
  reflexion?: string
  // La actividad que destraba la semana (chip dorado). El campo ya existía en
  // Week; lo escribe el paso 5 del planeador.
  desbloqueador?: string
  horarioOverride?: string
  wins: WinInput[]
  tasks: TaskInput[]
  // Tareas que YA existen en el backlog y se enganchan a esta semana. Sin esto,
  // el planeador las duplicaría: `tasks` siempre hace task.create. El `ref` para
  // los bloques es el propio id.
  adoptar?: AdoptarInput[]
  // Riesgos del pre-mortem (paso 5 del planeador). Antes se generaban y se tiraban:
  // solo el desbloqueador se guardaba. Cerrarlos al cerrar la semana es evidencia
  // fechada de capacidad predictiva.
  riesgos?: Array<{ riesgo: string; defensa: string }>
  // Opt-in del planeador: reutiliza un registro de semana VACÍO si ya existe.
  // Mi Día crea esos cascarones (weekForDate en dnd-actions) para colgar juntas
  // sincronizadas. Es opt-in y no el default a propósito: POST /weeks y la skill
  // /wtw-semana deben seguir rechazando duplicados en vez de sobrescribir en
  // silencio lo que ya está planeado.
  reutilizarVacia?: boolean
  blocks: BlockInput[]
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function createTasksAndBlocks(
  tx: TxClient,
  userId: string,
  weekId: string,
  tasks: TaskInput[],
  blocks: BlockInput[],
  winByPosicion: Map<number, string>,
  ordenInicial: number,
  // Refs ya resueltas antes de entrar (tareas adoptadas del backlog). Los bloques
  // las referencian igual que a las recién creadas.
  refsPrevias?: Map<string, string>
) {
  const projectIdByNombre = new Map<string, string>()
  const taskIdByRef = new Map<string, string>(refsPrevias ?? [])

  for (const t of tasks) {
    let projectId: string | undefined
    if (t.projectNombre) {
      projectId = projectIdByNombre.get(t.projectNombre)
      if (!projectId) {
        const project = await tx.project.upsert({
          where: { userId_nombre: { userId, nombre: t.projectNombre } },
          create: { userId, nombre: t.projectNombre },
          update: {},
        })
        projectId = project.id
        projectIdByNombre.set(t.projectNombre, projectId)
      }
    }

    const task = await tx.task.create({
      data: {
        userId,
        weekId,
        projectId,
        winId: t.winPosicion ? winByPosicion.get(t.winPosicion) : undefined,
        titulo: t.titulo,
        estimadoMin: t.estimadoMin,
        ajustadoMin: t.ajustadoMin,
        deadline: t.deadline ? new Date(t.deadline) : undefined,
        alcance: t.alcance ?? 'sow',
        dolorCliente: t.dolorCliente,
        estatus: 'planned',
        dodItems: { create: (t.dod ?? []).map((texto, orden) => ({ texto, orden })) },
      },
    })
    taskIdByRef.set(t.ref, task.id)
  }

  for (const [i, b] of blocks.entries()) {
    await tx.block.create({
      data: {
        weekId,
        taskId: b.taskRef ? taskIdByRef.get(b.taskRef) : undefined,
        fecha: new Date(b.fecha),
        inicio: b.inicio,
        fin: b.fin,
        tipo: b.tipo,
        titulo: b.titulo,
        planMin: b.planMin,
        orden: ordenInicial + i,
      },
    })
  }
}

export async function createWeekPayload(userId: string, payload: CreateWeekPayload) {
  const { inicio, fin } = weekRange(payload.isoWeek)

  return prisma.$transaction(async (tx) => {
    // Mi Día crea semanas vacías por su cuenta (weekForDate en dnd-actions) para
    // colgar juntas sincronizadas o tareas arrastradas. Ese cascarón no es un
    // plan: si existe, se reutiliza. Sin esto, planear el lunes después de abrir
    // Mi Día tronaba por la restricción única (userId, isoWeek).
    const previa = await tx.week.findUnique({
      where: { userId_isoWeek: { userId, isoWeek: payload.isoWeek } },
      include: { _count: { select: { wins: true, tasks: true } } },
    })

    if (previa) {
      // Una semana CON plan nunca se fusiona: duplicaría wins y tareas.
      if (previa._count.wins > 0 || previa._count.tasks > 0) {
        throw new Error(`la semana ${payload.isoWeek} ya tiene un plan (${previa._count.wins} wins, ${previa._count.tasks} tareas)`)
      }
      // Vacía, pero el llamador no pidió reutilizar: se rechaza igual. Mantiene
      // el contrato de POST /weeks — duplicado es error, no sobrescritura.
      if (!payload.reutilizarVacia) {
        throw new Error(`la semana ${payload.isoWeek} ya existe`)
      }
    }

    const datos = {
      factorUsado: payload.factorUsado,
      reflexion: payload.reflexion,
      desbloqueador: payload.desbloqueador,
      horarioOverride: payload.horarioOverride,
      estatus: 'planning' as const,
    }

    const week = previa
      ? await tx.week.update({ where: { id: previa.id }, data: datos })
      : await tx.week.create({ data: { userId, isoWeek: payload.isoWeek, rangoInicio: inicio, rangoFin: fin, ...datos } })

    // Los bloques que ya trae el cascarón (juntas de Outlook) conservan su orden:
    // los nuevos se numeran después para no empatar.
    const ordenInicial = previa
      ? ((await tx.block.aggregate({ where: { weekId: week.id }, _max: { orden: true } }))._max.orden ?? -1) + 1
      : 0

    const winByPosicion = new Map<number, string>()
    for (const w of payload.wins) {
      const win = await tx.win.create({
        data: { weekId: week.id, posicion: w.posicion, titulo: w.titulo, dod: w.dod },
      })
      winByPosicion.set(w.posicion, win.id)
    }

    // Adoptar antes de crear: el update filtra por userId, así que un id ajeno
    // no engancha nada en vez de robar la tarea de otro usuario.
    const refsAdoptadas = new Map<string, string>()
    for (const a of payload.adoptar ?? []) {
      const { count } = await tx.task.updateMany({
        where: { id: a.id, userId },
        data: {
          weekId: week.id,
          winId: a.winPosicion ? winByPosicion.get(a.winPosicion) : undefined,
          estimadoMin: a.estimadoMin,
          ajustadoMin: a.ajustadoMin,
          estatus: 'planned',
        },
      })
      if (count === 0) throw new Error(`tarea ${a.id} no encontrada`)
      refsAdoptadas.set(a.id, a.id)
    }

    for (const [i, r] of (payload.riesgos ?? []).entries()) {
      await tx.weekRisk.create({ data: { weekId: week.id, riesgo: r.riesgo, defensa: r.defensa, orden: i } })
    }

    await createTasksAndBlocks(tx, userId, week.id, payload.tasks, payload.blocks, winByPosicion, ordenInicial, refsAdoptadas)

    return week
  }, { timeout: 20000 })
}

export async function appendBlocks(
  userId: string,
  isoWeek: string,
  payload: { tasks: TaskInput[]; blocks: BlockInput[] }
) {
  const week = await prisma.week.findUnique({ where: { userId_isoWeek: { userId, isoWeek } }, include: { blocks: true } })
  if (!week) throw new Error('semana no encontrada')

  const winByPosicion = new Map<number, string>()
  const wins = await prisma.win.findMany({ where: { weekId: week.id } })
  for (const w of wins) winByPosicion.set(w.posicion, w.id)

  await prisma.$transaction(
    (tx) => createTasksAndBlocks(tx, userId, week.id, payload.tasks, payload.blocks, winByPosicion, week.blocks.length),
    { timeout: 20000 }
  )

  // createTasksAndBlocks no devuelve nada — sin este refetch, la respuesta
  // del endpoint serializaba a `{}` (JSON.stringify descarta claves undefined),
  // dejando a quien llama sin forma de confirmar qué se creó.
  return getWeek(userId, isoWeek)
}

export async function getWeek(userId: string, isoWeek: string) {
  return prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek } },
    include: {
      wins: { orderBy: { posicion: 'asc' } },
      tasks: { include: { dodItems: { orderBy: { orden: 'asc' } }, project: true }, orderBy: { createdAt: 'asc' } },
      blocks: { orderBy: [{ fecha: 'asc' }, { orden: 'asc' }] },
    },
  })
}
