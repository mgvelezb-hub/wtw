'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  cancelMeetingAction,
  moveBlockAction,
  scheduleTaskAction,
  setBlockDurationAction,
  setBlockTimeAction,
  toggleBloqueanteAction,
  unscheduleBlockAction,
} from '@/app/(app)/dia/dnd-actions'
import { captureAction } from '@/app/(app)/inbox/actions'
import { SNAP_MIN } from '@/app/(app)/semana/lienzo'

// Las actions de Mi Día (`dia/dnd-actions`) son la ÚNICA implementación de
// mover / agendar / desagendar, con sus propios checks de propiedad. El lienzo
// no las reescribe: las envuelve. Lo único que agrega el envoltorio es
// `revalidatePath('/semana')` — aquellas solo revalidan `/dia`, así que sin
// esto el lienzo se quedaba pintando el estado anterior después de cada
// arrastre.
async function uid(): Promise<string> {
  const session = await verifySession()
  if (!session) throw new Error('no autenticado')
  return session.userId
}

function revalidar(): void {
  revalidatePath('/semana')
  revalidatePath('/dia')
}

// Arrastrar un bloque a otra columna. Conserva la hora (moveBlockAction solo
// toca `fecha`); si además se soltó a cierta altura del grid, `hhmm` trae la
// hora nueva ya redondeada por el cliente.
//
// El orden importa: primero mover, luego poner hora. Al revés, setBlockTime
// reacomodaría los vecinos del día VIEJO — el día del que el bloque ya se va.
export async function moverBloqueAction(blockId: string, dateStr: string, hhmm: string | null) {
  await moveBlockAction(blockId, dateStr)
  if (hhmm) {
    const block = await prisma.block.findUnique({ where: { id: blockId }, select: { tipo: true } })
    // Solo los bloques de tarea se reposicionan: una junta la manda el
    // calendario, no el arrastre.
    if (block?.tipo === 'tarea') await setBlockTimeAction(blockId, hhmm, SNAP_MIN)
  }
  revalidar()
}

// Arrastrar un pendiente de la bandeja a una columna. `scheduleTaskAction` lo
// deja como bloque flex; si cayó dentro del grid hay que buscar el bloque que
// acaba de crear para darle hora — no devuelve id.
export async function agendarTareaAction(taskId: string, dateStr: string, hhmm: string | null) {
  const userId = await uid()
  await scheduleTaskAction(taskId, dateStr)
  if (hhmm) {
    const block = await prisma.block.findFirst({
      where: { taskId, fecha: new Date(dateStr), tipo: 'tarea', week: { userId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (block) await setBlockTimeAction(block.id, hhmm, SNAP_MIN)
  }
  revalidar()
}

// Estirar o encoger un bloque desde la esquina inferior del lienzo. La cascada
// vive en dia/dnd-actions; aquí solo se agrega la revalidación de /semana.
export async function redimensionarBloqueAction(blockId: string, durMin: number) {
  await setBlockDurationAction(blockId, durMin)
  revalidar()
}

// Una junta de Outlook que no quita tiempo real: sigue visible en el lienzo
// pero deja de restar capacidad y de estorbar el reflow — y los bloques de
// tarea pueden sobreponérsele.
export async function alternarJuntaBloqueanteAction(blockId: string) {
  await toggleBloqueanteAction(blockId)
  revalidar()
}

// Cancelar la junta desde el lienzo: desaparece de la semana hasta el próximo
// sync (si sigue viva en Outlook, el sync la trae de vuelta).
export async function cancelarJuntaAction(blockId: string) {
  await cancelMeetingAction(blockId)
  revalidar()
}

// Arrastrar un bloque de vuelta a la bandeja: la tarea regresa a backlog.
export async function desagendarBloqueAction(blockId: string) {
  await unscheduleBlockAction(blockId)
  revalidar()
}

// Captura desde la bandeja — misma action del inbox, para que una tarea suelta
// capturada aquí sea indistinguible de una capturada en /inbox.
export async function capturarEnBandejaAction(titulo: string) {
  await captureAction({ titulo })
  revalidar()
}

export async function toggleWinAction(winId: string) {
  const userId = await uid()

  const win = await prisma.win.findUnique({ where: { id: winId }, include: { week: true } })
  if (!win || win.week.userId !== userId) throw new Error('win no encontrado')

  await prisma.win.update({
    where: { id: winId },
    data: { estatus: win.estatus === 'logrado' ? 'pendiente' : 'logrado' },
  })
  revalidatePath('/semana')
}
