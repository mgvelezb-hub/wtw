import type { Recordatorios } from './push'
import { isoWeekOf } from './dates'

// ¿Toca mandar el aviso en este tick del cron?
//
// El cron corre cada 15 minutos, así que "las 18:00" es en realidad "el tick
// que cae dentro de la ventana de las 18:00". La ventana se abre en la hora
// configurada y dura menos que el intervalo del cron: sin eso, o el aviso se
// pierde cuando el tick cae a las 18:03, o se manda dos veces cuando caen dos
// ticks en la misma hora.
export const VENTANA_MIN = 15

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function dentroDeVentana(horaConfigurada: string, minutosAhora: number): boolean {
  const objetivo = toMin(horaConfigurada)
  return minutosAhora >= objetivo && minutosAhora < objetivo + VENTANA_MIN
}

export type Momento = { diaSemana: number; minutos: number }

/** Qué avisos toca evaluar en este tick — todavía sin mirar si hacen falta. */
export function avisosDelTick(r: Recordatorios, ahora: Momento): Array<'ritual' | 'cierre'> {
  const salida: Array<'ritual' | 'cierre'> = []
  if (r.ritual && ahora.diaSemana === r.ritual.dia && dentroDeVentana(r.ritual.hora, ahora.minutos)) {
    salida.push('ritual')
  }
  // El cierre es de lunes a viernes: un recordatorio de cerrar el día en sábado
  // empuja justo la erosión de frontera que el semáforo JD-R mide.
  const habil = ahora.diaSemana >= 1 && ahora.diaSemana <= 5
  if (r.cierre && habil && dentroDeVentana(r.cierre.hora, ahora.minutos)) {
    salida.push('cierre')
  }
  return salida
}

// La semana que el ritual va a planear. El lunes es la semana EN CURSO —quien
// planea el lunes por la mañana planea el día que empieza—; cualquier otro día
// es la que arranca el próximo lunes. Sumar un día sin más fallaba en viernes y
// sábado: ahí "mañana" sigue cayendo dentro de la misma semana ISO, así que el
// aviso comprobaba el plan de la semana que ya se está viviendo y nunca salía.
export function isoWeekAPlanear(ahora: Date, diaSemana: number): string {
  if (diaSemana === 1) return isoWeekOf(ahora)
  const d = new Date(ahora)
  d.setUTCDate(d.getUTCDate() + ((8 - diaSemana) % 7 || 7))
  return isoWeekOf(d)
}
