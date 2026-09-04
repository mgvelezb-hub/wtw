import type { Recordatorios } from './push'

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

/**
 * Qué avisos toca evaluar en este tick — todavía sin mirar si hacen falta.
 *
 * `tickUnico` existe por una restricción de la cuenta, no de diseño: en el plan
 * Hobby de Vercel un cron se dispara UNA vez al día, así que no hay forma de
 * acertarle a la hora que cada quien configuró. Con tick único la hora se
 * ignora y solo manda el DÍA: el aviso llega en el único tick que hay. Es una
 * degradación consciente y visible en Ajustes, no un bug silencioso; con plan
 * Pro el schedule vuelve a `*&#47;15` y la hora se respeta otra vez.
 */
export function avisosDelTick(
  r: Recordatorios,
  ahora: Momento,
  opciones: { tickUnico?: boolean } = {}
): Array<'ritual' | 'cierre'> {
  const enHora = (hora: string) => opciones.tickUnico === true || dentroDeVentana(hora, ahora.minutos)
  const salida: Array<'ritual' | 'cierre'> = []
  if (r.ritual && ahora.diaSemana === r.ritual.dia && enHora(r.ritual.hora)) {
    salida.push('ritual')
  }
  // El cierre es de lunes a viernes: un recordatorio de cerrar el día en sábado
  // empuja justo la erosión de frontera que el semáforo JD-R mide.
  const habil = ahora.diaSemana >= 1 && ahora.diaSemana <= 5
  if (r.cierre && habil && enHora(r.cierre.hora)) {
    salida.push('cierre')
  }
  return salida
}

/**
 * Un solo tick al día (plan Hobby) o uno cada 15 min (plan Pro).
 *
 * Default: tick único, porque es lo que la cuenta permite hoy. Poner
 * `RECORDATORIOS_TICK_UNICO=0` en Vercel es el interruptor para cuando el cron
 * pase a `*&#47;15` — y hay que cambiar las dos cosas a la vez: el schedule en
 * `vercel.json` y esta variable.
 */
export function tickUnicoActivo(env: Record<string, string | undefined>): boolean {
  return env.RECORDATORIOS_TICK_UNICO !== '0'
}
