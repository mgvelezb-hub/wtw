import 'server-only'
import { prisma } from './prisma'
import type { Aviso } from './push'
import type { Momento } from './recordatorios'
import { isoWeekAPlanear } from './dates'
import { getCierreDia } from '@/app/(app)/cierre/service'
import type { EstadoAvisos } from './avisos-locales'

// Qué avisos hacen falta, consultando el estado real. Lo comparten el cron del
// push web y el endpoint que alimenta las notificaciones locales del cascarón:
// una sola definición de "ya está planeada" y de "ya está cerrado", para que
// los dos canales no discrepen.

export function momentoLocal(zona: string, ahora: Date): Momento {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora)
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const weekday = partes.find((p) => p.type === 'weekday')!.value
  const h = Number(partes.find((p) => p.type === 'hour')!.value) % 24
  const m = Number(partes.find((p) => p.type === 'minute')!.value)
  return { diaSemana: dias[weekday] ?? 0, minutos: h * 60 + m }
}

// La fecha de HOY en la zona de esa persona. `todayStr` está fijado a México y
// aquí se recorren usuarios que pueden estar en otra zona.
export function fechaLocal(zona: string, ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(ahora)
}

// Un cascarón vacío (el que crea Mi Día para colgar juntas) no es un plan:
// misma definición que usa el planeador para decidir si ya está planeada.
export async function semanaPlaneada(userId: string, isoWeek: string): Promise<boolean> {
  const week = await prisma.week.findUnique({
    where: { userId_isoWeek: { userId, isoWeek } },
    select: { _count: { select: { wins: true, tasks: true } } },
  })
  return week !== null && (week._count.wins > 0 || week._count.tasks > 0)
}

export async function avisoRitual(userId: string, ahora: Date, diaSemana: number): Promise<Aviso | null> {
  const isoWeek = isoWeekAPlanear(ahora, diaSemana)
  if (await semanaPlaneada(userId, isoWeek)) return null

  return {
    titulo: `Sin plan para la ${isoWeek.replace('-W', ' · semana ')}`,
    cuerpo: 'El ritual son 10 minutos: reflejar, definir Wins, dimensionar y bloquear.',
    // La semana va en la ruta: el planeador ya sabe planear la que se le pida,
    // y así el aviso y su destino no pueden discrepar.
    ruta: `/semana/nueva?semana=${isoWeek}`,
    tag: `ritual-${isoWeek}`,
  }
}

export async function avisoCierre(userId: string, hoy: string): Promise<Aviso | null> {
  const cierre = await getCierreDia(userId, hoy)
  if (cierre.yaReconciliado) return null
  // Sin plan del día no hay nada que reconciliar: avisar ahí sería pedirle
  // cerrar un día que nunca se abrió.
  if (cierre.planMin === 0) return null

  const sinExplicar = Math.max(0, cierre.huecoMin - cierre.explicadoMin)
  if (sinExplicar < 15) return null

  return {
    titulo: `${Math.round(sinExplicar)} min del día sin explicar`,
    cuerpo: 'Clasificar por qué se rompió el plan toma un minuto y es lo que alimenta tu factor.',
    ruta: '/cierre',
    tag: `cierre-${hoy}`,
  }
}

/**
 * El estado que necesita `planLocal` para decidir qué programar en el
 * dispositivo. Se calcula al sincronizar, no al disparar: de ahí que el cierre
 * solo pueda saber "hay plan y no está cerrado", no cuántos minutos quedarán.
 */
export async function estadoAvisos(userId: string, zona: string, ahora: Date): Promise<EstadoAvisos> {
  const { diaSemana } = momentoLocal(zona, ahora)
  const isoWeek = isoWeekAPlanear(ahora, diaSemana)
  const hoy = fechaLocal(zona, ahora)
  const [planeada, cierre] = await Promise.all([semanaPlaneada(userId, isoWeek), getCierreDia(userId, hoy)])
  return {
    isoWeekAPlanear: isoWeek,
    semanaPlaneada: planeada,
    hoy,
    diaConPlan: cierre.planMin > 0,
    yaReconciliado: cierre.yaReconciliado,
  }
}
