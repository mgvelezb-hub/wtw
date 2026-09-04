export function isoWeekOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day) // jueves de la semana define el año ISO
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

export function weekRange(isoWeek: string): { inicio: Date; fin: Date } {
  const [y, w] = isoWeek.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (w - 1) * 7)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  return { inicio: monday, fin: friday }
}

// La semana CALENDARIO: lunes a domingo. `weekRange` devuelve la jornada
// (lun–vie) porque de ahí salen capacidad y planeación, y eso está bien; pero
// el lienzo tiene que poder VER el sábado y el domingo. Mientras cargó lun–vie,
// el trabajo de fin de semana no existía para el lienzo aunque la señal de
// erosión de frontera —que lee TimeEntry directo— sí lo contaba: el lienzo
// listaba 6 bloques fuera de jornada y el % decía 61%.
export function weekRangeFull(isoWeek: string): { inicio: Date; fin: Date } {
  const { inicio } = weekRange(isoWeek)
  const domingo = new Date(inicio)
  domingo.setUTCDate(inicio.getUTCDate() + 6)
  return { inicio, fin: domingo }
}

// Sábado o domingo, leído de una fecha AAAA-MM-DD (no de un Date con zona: las
// fechas del lienzo ya vienen normalizadas a día calendario).
export function esFinDeSemana(fecha: string): boolean {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return dia === 0 || dia === 6
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

const USER_TZ = 'America/Mexico_City'

// "en-CA" formatea como AAAA-MM-DD. México va UTC-6, así que usar
// toISOString() (siempre UTC) hacía que "hoy" saltara al día siguiente a
// las 6pm hora local (18:00 CDMX = 00:00 UTC) — el día de trabajo se
// cerraba solo, horas antes de que Mau terminara su jornada real.
export function todayStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TZ }).format(d)
}

// Minutos desde medianoche, hora de México — para comparar contra bloques/juntas
// (que ya se guardan como "HH:MM" en hora local) sin usar el reloj UTC del servidor.
export function nowMinutesMx(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: USER_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = Number(parts.find((p) => p.type === 'hour')!.value)
  const m = Number(parts.find((p) => p.type === 'minute')!.value)
  return h * 60 + m
}

// Día de la semana (0=domingo) en hora de México. Igual que `todayStr`: el
// `getDay()` del proceso es UTC y a partir de las 18:00 locales ya contesta el
// día siguiente, que es justo el momento en que se planea.
export function diaSemanaMx(d: Date = new Date()): number {
  const abr = new Intl.DateTimeFormat('en-GB', { timeZone: USER_TZ, weekday: 'short' }).format(d)
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return dias[abr] ?? 0
}
