import { prisma } from '@/lib/prisma'
import type { Block, Task, TipoTrabajo } from '@prisma/client'
import { isoWeekOf } from '@/lib/dates'

// Capturar una actividad exigía salir a /inbox y volver. Cuando algo cae a media
// mañana —una junta que suelta trabajo, un pendiente que aparece— salir del día
// es justo lo que hace que no se registre; y lo que no se registra no entra en
// la carga contra la que se mide el sobre-compromiso.
//
// Vive fuera de un archivo 'use server' porque devuelve objetos de Prisma y se
// prueba directo: un archivo de acciones solo puede exportar funciones async y
// todo lo que exporta queda expuesto como endpoint.

export interface NuevaActividad {
  titulo: string
  fecha: string // día al que se agenda, y del que sale la semana
  projectId?: string
  winId?: string
  herramienta?: string
  tipoTrabajo?: TipoTrabajo
  estimadoMin?: number
  agendar: boolean
}

export async function crearActividadDelDia(
  userId: string,
  data: NuevaActividad
): Promise<{ task: Task; block: Block | null }> {
  const titulo = data.titulo.trim()
  if (titulo === '') throw new Error('La actividad necesita un título.')

  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek: isoWeekOf(new Date(data.fecha)) } },
  })

  // El Win se valida contra la semana del usuario, no se toma por bueno: llega
  // de un <select> del cliente y colgar trabajo del Win de alguien más lo haría
  // aparecer en el avance de ese Win.
  if (data.winId) {
    const win = await prisma.win.findUnique({ where: { id: data.winId }, include: { week: true } })
    if (!win || win.week.userId !== userId) throw new Error('Win no encontrado.')
  }

  // El factor de realismo es el mecanismo contra la brecha #1 del 360
  // —sobre-optimismo en estimaciones—, así que una actividad capturada a mano
  // tiene que inflarse igual que una que pasó por el planeador. Sin estimado no
  // se inventa nada: `null` significa "todavía no sé", y el código que calibra
  // salta las tareas sin estimado en vez de contarlas como perfectas.
  const factor = week ? Number(week.factorUsado) : 1
  const ajustadoMin = data.estimadoMin != null ? Math.round(data.estimadoMin * factor) : null

  const task = await prisma.task.create({
    data: {
      userId,
      titulo,
      projectId: data.projectId || null,
      winId: data.winId || null,
      herramienta: data.herramienta || null,
      tipoTrabajo: data.tipoTrabajo ?? null,
      estimadoMin: data.estimadoMin ?? null,
      ajustadoMin,
      // Sin agendar se queda en el backlog y aparece en Pendientes; agendada
      // entra a la semana como planeada, igual que lo que sale del planeador.
      weekId: data.agendar ? (week?.id ?? null) : null,
      estatus: data.agendar && week ? 'planned' : 'backlog',
    },
  })

  if (!data.agendar || !week) return { task, block: null }

  // Flex y no a una hora: el hueco lo decide Mau arrastrando, y ponerle una hora
  // inventada la haría chocar con lo que ya está agendado.
  const orden = await prisma.block.aggregate({
    where: { weekId: week.id, fecha: new Date(data.fecha) },
    _max: { orden: true },
  })

  const block = await prisma.block.create({
    data: {
      weekId: week.id,
      taskId: task.id,
      fecha: new Date(data.fecha),
      inicio: 'flex',
      fin: 'flex',
      tipo: 'tarea',
      titulo,
      // Los minutos AJUSTADOS, no el estimado crudo: el bloque es lo que se
      // compara contra la capacidad del día, y compararla contra el crudo es
      // precisamente sobre-vender el día.
      planMin: ajustadoMin ?? 0,
      orden: (orden._max.orden ?? 0) + 1,
    },
  })

  return { task, block }
}
