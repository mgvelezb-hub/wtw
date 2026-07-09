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
