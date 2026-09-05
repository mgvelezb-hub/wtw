import type { Recordatorios } from './push'

// Avisos LOCALES para el cascarón nativo. El push web quedó sin encender porque
// en el iPad esto se resuelve mejor sin servidor: la notificación se programa
// en el dispositivo y llega aunque Neon esté dormido o no haya red.
//
// La regla de fondo es la misma que la del cron: un aviso que llega cuando la
// cosa ya está hecha educa a ignorarlo. Aquí no se puede evaluar el estado en
// el momento de disparar, así que se hace lo segundo mejor: el servidor decide
// qué avisos hacen falta AHORA y el cascarón los reprograma cada vez que la
// app vuelve al frente, cancelando los que dejaron de aplicar. Límite conocido:
// si la semana se planea desde la Mac y el iPad no se abre antes del domingo,
// el aviso del ritual llega de más. Ese caso lo cierra el push remoto, que
// necesita la cuenta de desarrollador de pago.
//
// Todo lo de este archivo es puro: fechas de entrada, avisos de salida. Lo que
// consulta la base vive en `avisos.ts`.

export const ID_RITUAL = 1001
export const ID_CIERRE = 1002

export type AvisoLocal = {
  id: number
  tipo: 'ritual' | 'cierre'
  /** Instante UTC en ISO. */
  at: string
  titulo: string
  cuerpo: string
  ruta: string
}

export type EstadoAvisos = {
  isoWeekAPlanear: string
  semanaPlaneada: boolean
  /** Fecha local YYYY-MM-DD de la persona. */
  hoy: string
  diaConPlan: boolean
  yaReconciliado: boolean
}

function partesEn(zona: string, d: Date): { fecha: string; minutos: number; diaSemana: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)!.value
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  // en-CA da "24" a medianoche en algunos motores; se normaliza.
  const hora = Number(v('hour')) % 24
  return {
    fecha: `${v('year')}-${v('month')}-${v('day')}`,
    minutos: hora * 60 + Number(v('minute')),
    diaSemana: dias[v('weekday')] ?? 0,
  }
}

/** Instante UTC de `fecha` a las `hhmm` en `zona`, sin librerías: se asume UTC y se corrige por el offset real. */
export function instanteLocal(fecha: string, hhmm: string, zona: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const supuesto = new Date(`${fecha}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`)
  const enZona = partesEn(zona, supuesto)
  const [y, mo, d] = enZona.fecha.split('-').map(Number)
  const leido = Date.UTC(y, mo - 1, d, Math.floor(enZona.minutos / 60), enZona.minutos % 60)
  const offset = leido - supuesto.getTime()
  return new Date(supuesto.getTime() - offset)
}

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Próximo `diaSemana` (0=domingo) a las `hhmm` en `zona`, estrictamente después de `ahora`. */
export function proximaOcurrencia(diaSemana: number, hhmm: string, ahora: Date, zona: string): Date {
  const hoy = partesEn(zona, ahora)
  let delta = (diaSemana - hoy.diaSemana + 7) % 7
  let candidato = instanteLocal(sumarDias(hoy.fecha, delta), hhmm, zona)
  if (candidato.getTime() <= ahora.getTime()) {
    delta += 7
    candidato = instanteLocal(sumarDias(hoy.fecha, delta), hhmm, zona)
  }
  return candidato
}

export function planLocal(r: Recordatorios, ahora: Date, zona: string, estado: EstadoAvisos): AvisoLocal[] {
  const salida: AvisoLocal[] = []

  if (r.ritual && !estado.semanaPlaneada) {
    const at = proximaOcurrencia(r.ritual.dia, r.ritual.hora, ahora, zona)
    salida.push({
      id: ID_RITUAL,
      tipo: 'ritual',
      at: at.toISOString(),
      titulo: `Sin plan para la ${estado.isoWeekAPlanear.replace('-W', ' · semana ')}`,
      cuerpo: 'El ritual son 10 minutos: reflejar, definir Wins, dimensionar y bloquear.',
      ruta: `/semana/nueva?semana=${estado.isoWeekAPlanear}`,
    })
  }

  // Cierre: solo hoy, solo lunes a viernes, solo si hay plan y no está cerrado.
  // Cuántos minutos quedarán sin explicar no se sabe por adelantado, así que el
  // texto no promete un número: el del cron sí lo trae porque lo mide al mandar.
  const hoy = partesEn(zona, ahora)
  const habil = hoy.diaSemana >= 1 && hoy.diaSemana <= 5
  if (r.cierre && habil && estado.diaConPlan && !estado.yaReconciliado) {
    const at = instanteLocal(estado.hoy, r.cierre.hora, zona)
    if (at.getTime() > ahora.getTime()) {
      salida.push({
        id: ID_CIERRE,
        tipo: 'cierre',
        at: at.toISOString(),
        titulo: 'Cierra el día',
        cuerpo: 'Clasificar por qué se rompió el plan toma un minuto y es lo que alimenta tu factor.',
        ruta: '/cierre',
      })
    }
  }

  return salida
}
