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
  horarioOverride?: string
  wins: WinInput[]
  tasks: TaskInput[]
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
  ordenInicial: number
) {
  const projectIdByNombre = new Map<string, string>()
  const taskIdByRef = new Map<string, string>()

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
    const week = await tx.week.create({
      data: {
        userId,
        isoWeek: payload.isoWeek,
        rangoInicio: inicio,
        rangoFin: fin,
        factorUsado: payload.factorUsado,
        reflexion: payload.reflexion,
        horarioOverride: payload.horarioOverride,
        estatus: 'planning',
      },
    })

    const winByPosicion = new Map<number, string>()
    for (const w of payload.wins) {
      const win = await tx.win.create({
        data: { weekId: week.id, posicion: w.posicion, titulo: w.titulo, dod: w.dod },
      })
      winByPosicion.set(w.posicion, win.id)
    }

    await createTasksAndBlocks(tx, userId, week.id, payload.tasks, payload.blocks, winByPosicion, 0)

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
