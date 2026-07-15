'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isoWeekOf, weekRange, nowMinutesMx } from '@/lib/dates'
import { syncCalendar } from '@/app/api/v1/calendar/service'
import { runningEntry } from '@/app/api/v1/timer/service'

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fromMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Tope de las cascadas: un bloque cuyo inicio O fin cruza medianoche no se
// agenda a una hora imposible ("26:27" rompía la UI y hacía que Outlook
// rechazara el .ics exportado completo) — regresa a 'flex' (sin hora) para
// reacomodarlo a mano. Chequea ambos extremos: un bloque puede empezar antes
// de medianoche y terminar después.
function timesOrFlex(start: number, dur: number): { inicio: string; fin: string } {
  if (start >= 1440 || start + dur > 1440) return { inicio: 'flex', fin: 'flex' }
  return { inicio: fromMin(start), fin: fromMin(start + dur) }
}

async function uid(): Promise<string> {
  const s = await verifySession()
  if (!s) throw new Error('no autenticado')
  return s.userId
}

async function weekForDate(userId: string, dateStr: string) {
  const isoWeek = isoWeekOf(new Date(dateStr))
  const existing = await prisma.week.findUnique({ where: { userId_isoWeek: { userId, isoWeek } } })
  if (existing) return existing
  const { inicio, fin } = weekRange(isoWeek)
  return prisma.week.create({
    data: { userId, isoWeek, rangoInicio: inicio, rangoFin: fin, factorUsado: 1.4, estatus: 'active' },
  })
}

async function nextOrden(userId: string, dateStr: string): Promise<number> {
  const agg = await prisma.block.aggregate({
    where: { fecha: new Date(dateStr), week: { userId } },
    _max: { orden: true },
  })
  return (agg._max.orden ?? -1) + 1
}

// Agenda un pendiente del backlog a un día: lo pasa a planned y le crea un
// bloque flex (sin hora fija — Mau le pone la hora después). Sirve para el
// drag pendiente→día y para el botón "+ Hoy".
export async function scheduleTaskAction(taskId: string, dateStr: string) {
  const userId = await uid()
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task || task.userId !== userId) throw new Error('task no encontrada')

  const week = await weekForDate(userId, dateStr)
  const orden = await nextOrden(userId, dateStr)
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { estatus: 'planned', weekId: week.id, urgente: false } }),
    prisma.block.create({
      data: {
        weekId: week.id,
        taskId,
        fecha: new Date(dateStr),
        inicio: 'flex',
        fin: 'flex',
        tipo: 'tarea',
        titulo: task.titulo,
        planMin: task.estimadoMin ?? 60,
        orden,
      },
    }),
  ])
  revalidatePath('/dia')
}

// Mueve un bloque a otro día (drag sobre la pestaña de día).
export async function moveBlockAction(blockId: string, dateStr: string) {
  const userId = await uid()
  const block = await prisma.block.findUnique({ where: { id: blockId }, include: { week: true } })
  if (!block || block.week.userId !== userId) throw new Error('block no encontrado')

  const week = await weekForDate(userId, dateStr)
  const orden = await nextOrden(userId, dateStr)
  await prisma.block.update({
    where: { id: blockId },
    data: { fecha: new Date(dateStr), weekId: week.id, orden },
  })
  revalidatePath('/dia')
}

// "Llevar a hoy" — el bloque queda como estaba (mismo estimado/tiempo acumulado,
// el TimeEntry no se toca), solo cambia su fecha y semana al día de hoy.
export async function carryToTodayAction(blockId: string, todayStr: string) {
  await moveBlockAction(blockId, todayStr)
}

export async function carryAllToTodayAction(blockIds: string[], todayStr: string) {
  const userId = await uid()
  const week = await weekForDate(userId, todayStr)
  let orden = await nextOrden(userId, todayStr)
  const blocks = await prisma.block.findMany({ where: { id: { in: blockIds }, week: { userId } } })
  await prisma.$transaction(
    blocks.map((b) =>
      prisma.block.update({ where: { id: b.id }, data: { fecha: new Date(todayStr), weekId: week.id, orden: orden++ } })
    )
  )
  revalidatePath('/dia')
}

function nextBusinessDay(todayStr: string): string {
  const d = new Date(todayStr)
  d.setUTCDate(d.getUTCDate() + 1)
  const dow = d.getUTCDay() // 0=domingo, 6=sábado
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Cierre manual del día: mueve las tareas de HOY que quedaron sin terminar al
// siguiente día hábil. Explícito por decisión de Mau — nada se mueve solo por
// la hora (la jornada 09-18 es una referencia, no un límite duro para este
// proyecto).
export async function closeDayAction(todayStr: string) {
  const userId = await uid()
  const blocks = await prisma.block.findMany({
    where: { week: { userId }, fecha: new Date(todayStr), tipo: 'tarea', task: { estatus: { in: ['planned', 'in_progress'] } } },
  })
  if (blocks.length === 0) return { moved: 0 }

  const target = nextBusinessDay(todayStr)
  const week = await weekForDate(userId, target)
  let orden = await nextOrden(userId, target)
  await prisma.$transaction(
    blocks.map((b) =>
      prisma.block.update({ where: { id: b.id }, data: { fecha: new Date(target), weekId: week.id, orden: orden++ } })
    )
  )
  revalidatePath('/dia')
  return { moved: blocks.length, target }
}

// Actualiza las juntas reales del día (Teams/Meet vía Outlook) y recorre los
// bloques de tarea que choquen con ellas — respeta la duración y el orden de
// cada actividad planeada, solo empuja lo necesario. Si al final del día ya
// no cabe todo antes de la jornada, los bloques que caen después se dejan
// agendados igual (no se pierden) y se marcan como fuera de jornada en
// getDayBlocks (comparando su fin contra horarioFin).
export async function reflowTodayAction(todayStr: string) {
  const userId = await uid()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (user.icsUrl) {
    try {
      await syncCalendar(userId)
    } catch {
      // si el fetch del ICS falla, seguimos con las juntas que ya teníamos
    }
  }

  const [eventos, blocks, running] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { userId, fecha: new Date(todayStr), cancelado: false, bloqueante: true } }),
    prisma.block.findMany({
      where: { week: { userId }, fecha: new Date(todayStr), tipo: 'tarea', inicio: { not: 'flex' } },
      include: { task: true },
      orderBy: { orden: 'asc' },
    }),
    runningEntry(userId),
  ])

  const fijos = eventos.map((e) => ({ inicio: toMin(e.inicio), fin: toMin(e.fin) }))

  const movibles: typeof blocks = []
  for (const b of blocks) {
    const terminado = b.task ? b.task.estatus === 'done' : b.done
    if (terminado) continue
    const corriendoAhora = !!(running && b.taskId === running.taskId)
    if (corriendoAhora) {
      // la tarea que se está cronometrando no se mueve — cuenta como obstáculo fijo
      fijos.push({ inicio: toMin(b.inicio), fin: toMin(b.fin) })
      continue
    }
    movibles.push(b)
  }
  if (movibles.length === 0) return { reflowed: 0, fueraDeJornada: 0 }
  fijos.sort((a, b) => a.inicio - b.inicio)

  const jornadaFin = toMin(user.horarioFin)
  let cursor = Math.max(nowAnchor30(), toMin(movibles[0].inicio))
  let fueraDeJornada = 0
  const updates: { id: string; inicio: string; fin: string }[] = []

  for (const b of movibles) {
    let start = cursor
    const dur = b.planMin
    let empujado = true
    while (empujado) {
      empujado = false
      for (const f of fijos) {
        if (start < f.fin && start + dur > f.inicio) {
          start = f.fin
          empujado = true
        }
      }
    }
    const end = start + dur
    if (end > jornadaFin) fueraDeJornada++
    updates.push({ id: b.id, ...timesOrFlex(start, dur) })
    cursor = end
  }

  await prisma.$transaction(
    updates.map((u) => prisma.block.update({ where: { id: u.id }, data: { inicio: u.inicio, fin: u.fin } }))
  )
  revalidatePath('/dia')
  return { reflowed: updates.length, fueraDeJornada }
}

function snap30(min: number): number {
  return Math.round(min / 30) * 30
}

// Ancla de "ahora" para cascadas: redondea HACIA ARRIBA al siguiente bloque de
// 30 min — nunca hacia abajo (agendaría en el pasado). Sin esto el ancla caía
// en el minuto exacto ("10:57") y esa hora se arrastraba en cascada a toda
// tarea siguiente del día, rompiendo la regla de bloques de 30 min.
function nowAnchor30(): number {
  return Math.ceil(nowMinutesMx() / 30) * 30
}

// Reposiciona un bloque de tarea a una hora exacta (drag o input de hora) —
// empuja SOLO los bloques de tarea que choquen (nunca las juntas: las
// actividades sí pueden traslaparse con una sesión si así se decide a mano).
export async function setBlockTimeAction(blockId: string, newInicioHHMM: string) {
  const userId = await uid()
  const moved = await prisma.block.findUnique({ where: { id: blockId }, include: { week: true, task: true } })
  if (!moved || moved.week.userId !== userId) throw new Error('block no encontrado')
  if (moved.tipo !== 'tarea') throw new Error('solo se reposicionan bloques de tarea')

  const fecha = moved.fecha
  const others = await prisma.block.findMany({
    where: {
      week: { userId },
      fecha,
      tipo: 'tarea',
      inicio: { not: 'flex' },
      id: { not: blockId },
    },
  })

  const newStart = Math.max(0, snap30(toMin(newInicioHHMM)))
  type Entry = { id: string; start: number; dur: number }
  const entries: Entry[] = [
    ...others.map((b) => ({ id: b.id, start: toMin(b.inicio), dur: b.planMin })),
    { id: blockId, start: newStart, dur: moved.planMin },
  ].sort((a, b) => a.start - b.start || (a.id === blockId ? -1 : 1))

  let cursor = entries[0].start
  const updates: { id: string; inicio: string; fin: string }[] = []
  for (const e of entries) {
    const start = Math.max(e.start, cursor)
    const end = start + e.dur
    updates.push({ id: e.id, ...timesOrFlex(start, e.dur) })
    cursor = end
  }

  await prisma.$transaction(
    updates.map((u) => prisma.block.update({ where: { id: u.id }, data: { inicio: u.inicio, fin: u.fin } }))
  )
  revalidatePath('/dia')
}

// Reordenar arrastrando: la mayoría de las tareas no tienen hora fija todavía
// ("sin hora"), así que soltar sobre otro bloque no puede depender de que el
// destino YA tenga hora — la posición donde se suelta es la que decide el
// horario. Recalcula la hora de TODOS los bloques de tarea del día (fijos o
// sin hora) en su nuevo orden, secuencial desde el inicio de jornada (o desde
// ahora si ya se pasó, para no agendar en el pasado). Las juntas no entran en
// esta secuencia — una tarea puede quedar encima de una junta a propósito.
export async function reorderDayAction(dateStr: string, draggedBlockId: string, targetBlockId: string | null) {
  const userId = await uid()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const blocks = await prisma.block.findMany({
    where: { week: { userId }, fecha: new Date(dateStr), tipo: 'tarea' },
    include: { task: true },
    orderBy: { orden: 'asc' },
  })

  const pendientes = blocks
    .filter((b) => (b.task ? b.task.estatus !== 'done' : !b.done))
    .sort((a, b) => {
      const ai = a.inicio === 'flex' ? '99:99' : a.inicio
      const bi = b.inicio === 'flex' ? '99:99' : b.inicio
      return ai.localeCompare(bi)
    })

  const dragged = pendientes.find((b) => b.id === draggedBlockId)
  if (!dragged) throw new Error('bloque no encontrado')

  const rest = pendientes.filter((b) => b.id !== draggedBlockId)
  const targetIdx = targetBlockId ? rest.findIndex((b) => b.id === targetBlockId) : -1
  const insertAt = targetIdx === -1 ? rest.length : targetIdx
  rest.splice(insertAt, 0, dragged)

  const isHoy = dateStr === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
  const jornadaInicio = toMin(user.horarioInicio)
  let cursor = isHoy ? Math.max(jornadaInicio, nowAnchor30()) : jornadaInicio

  const updates = rest.map((b, i) => {
    const start = cursor
    cursor = start + b.planMin
    return { id: b.id, ...timesOrFlex(start, b.planMin), orden: i }
  })

  await prisma.$transaction(
    updates.map((u) =>
      prisma.block.update({ where: { id: u.id }, data: { inicio: u.inicio, fin: u.fin, orden: u.orden } })
    )
  )
  revalidatePath('/dia')
}

// Ajuste manual de duración (fine-tuning) — empuja lo que venga después si ya
// no cabe. Nunca jala hacia atrás lo que viene después (no cierra huecos solo).
export async function setBlockDurationAction(blockId: string, newPlanMin: number) {
  const userId = await uid()
  const block = await prisma.block.findUnique({ where: { id: blockId }, include: { week: true } })
  if (!block || block.week.userId !== userId) throw new Error('block no encontrado')
  if (block.inicio === 'flex') {
    await prisma.block.update({ where: { id: blockId }, data: { planMin: newPlanMin } })
    revalidatePath('/dia')
    return
  }

  const others = await prisma.block.findMany({
    where: { week: { userId }, fecha: block.fecha, tipo: 'tarea', inicio: { not: 'flex' }, id: { not: blockId } },
  })
  const newEnd = toMin(block.inicio) + newPlanMin

  const after = others.filter((b) => toMin(b.inicio) >= toMin(block.inicio)).sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
  let cursor = newEnd
  const updates: { id: string; inicio: string; fin: string }[] = [
    { id: blockId, inicio: block.inicio, fin: fromMin(newEnd) },
  ]
  for (const b of after) {
    const start = Math.max(toMin(b.inicio), cursor)
    updates.push({ id: b.id, ...timesOrFlex(start, b.planMin) })
    cursor = start + b.planMin
  }

  await prisma.$transaction([
    prisma.block.update({ where: { id: blockId }, data: { planMin: newPlanMin } }),
    ...updates.map((u) => prisma.block.update({ where: { id: u.id }, data: { inicio: u.inicio, fin: u.fin } })),
  ])
  revalidatePath('/dia')
}

// Arrastrar un bloque agendado de vuelta al listado de pendientes — se borra
// el bloque del día y la tarea regresa a backlog (sin perder DoD/estimado).
export async function unscheduleBlockAction(blockId: string) {
  const userId = await uid()
  const block = await prisma.block.findUnique({ where: { id: blockId }, include: { week: true } })
  if (!block || block.week.userId !== userId) throw new Error('block no encontrado')
  if (!block.taskId) throw new Error('solo tareas se pueden regresar a pendientes')

  await prisma.$transaction([
    prisma.block.delete({ where: { id: blockId } }),
    prisma.task.update({ where: { id: block.taskId }, data: { estatus: 'backlog', weekId: null } }),
  ])
  revalidatePath('/dia')
}

// Marca una junta como cancelada — deja de contar en capacidad y en el reflow,
// y se muestra tachada en Terminadas/Canceladas. Dura hasta el siguiente
// "Actualizar juntas": si de verdad se canceló en Outlook, el sync ya no la
// trae de vuelta; si sigue viva en el feed real, el próximo sync la reescribe.
export async function cancelMeetingAction(blockId: string) {
  const userId = await uid()
  const eventId = blockId.replace(/^cal-/, '')
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } })
  if (!event || event.userId !== userId) throw new Error('junta no encontrada')
  await prisma.calendarEvent.update({ where: { id: eventId }, data: { cancelado: true } })
  revalidatePath('/dia')
}

// Distinto de cancelar: la junta SÍ va a pasar, solo que Mau no la necesita
// tomar (ej. se comparte solo para dar visibilidad de disponibilidad de un
// tercero). No resta capacidad ni cuenta como obstáculo del reflow, pero
// sigue visible en el timeline. Dura hasta el siguiente sync, igual que
// cancelar — si el evento cambia de fuente, se vuelve a evaluar.
export async function toggleBloqueanteAction(blockId: string) {
  const userId = await uid()
  const eventId = blockId.replace(/^cal-/, '')
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } })
  if (!event || event.userId !== userId) throw new Error('junta no encontrada')
  await prisma.calendarEvent.update({ where: { id: eventId }, data: { bloqueante: !event.bloqueante } })
  revalidatePath('/dia')
}
