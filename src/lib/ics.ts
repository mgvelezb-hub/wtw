export type IcsEvent = {
  uid: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
}

type RawEvent = {
  uid: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
  rrule?: string
  recurrenceId?: string // 'YYYY-MM-DD' de la instancia de serie que este evento reemplaza
  exdates: Set<string> // 'YYYY-MM-DD' de cada instancia excluida
}

function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function parseIcsDate(value: string): { date: Date; dateOnly: boolean } {
  const dateOnly = value.length <= 8
  const y = +value.slice(0, 4)
  const m = +value.slice(4, 6)
  const d = +value.slice(6, 8)
  if (dateOnly) return { date: new Date(Date.UTC(y, m - 1, d)), dateOnly: true }
  const hh = +value.slice(9, 11)
  const mm = +value.slice(11, 13)
  const ss = +value.slice(13, 15) || 0
  return { date: new Date(Date.UTC(y, m - 1, d, hh, mm, ss)), dateOnly: false }
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] // índice = getUTCDay()

function parseRawEvents(raw: string): RawEvent[] {
  const lines = unfold(raw).split(/\r?\n/)
  const events: RawEvent[] = []
  let cur: (Partial<RawEvent> & { exdates: Set<string> }) | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: new Set() }
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.uid && cur.start && cur.end) events.push(cur as RawEvent)
      cur = null
      continue
    }
    if (!cur) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const rawKey = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const key = rawKey.split(';')[0]
    const isDateOnly = rawKey.includes('VALUE=DATE')

    if (key === 'UID') cur.uid = value
    else if (key === 'SUMMARY') cur.summary = value
    else if (key === 'DTSTART') {
      const p = parseIcsDate(value)
      cur.start = p.date
      cur.allDay = isDateOnly || p.dateOnly
    } else if (key === 'DTEND') {
      cur.end = parseIcsDate(value).date
    } else if (key === 'RRULE') {
      cur.rrule = value
    } else if (key === 'RECURRENCE-ID') {
      const clean = value.trim().slice(0, 8)
      if (clean.length === 8) cur.recurrenceId = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
    } else if (key === 'EXDATE') {
      for (const v of value.split(',')) {
        const clean = v.trim().slice(0, 8)
        if (clean.length === 8) cur.exdates.add(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`)
      }
    }
  }
  return events
}

function parseRrule(rrule: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of rrule.split(';')) {
    const [k, v] = part.split('=')
    if (k && v) out[k] = v
  }
  return out
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function master(ev: RawEvent): IcsEvent {
  return { uid: ev.uid, summary: ev.summary, start: ev.start, end: ev.end, allDay: ev.allDay }
}

function occurrenceAt(ev: RawEvent, dayUTC: Date, index: number): IcsEvent {
  const start = new Date(
    Date.UTC(
      dayUTC.getUTCFullYear(),
      dayUTC.getUTCMonth(),
      dayUTC.getUTCDate(),
      ev.start.getUTCHours(),
      ev.start.getUTCMinutes(),
      ev.start.getUTCSeconds()
    )
  )
  const end = new Date(start.getTime() + (ev.end.getTime() - ev.start.getTime()))
  // UID único por instancia para no colisionar en la DB (serie comparte UID base)
  return { uid: `${ev.uid}__${ymd(start)}`, summary: ev.summary, start, end, allDay: ev.allDay }
}

function mondayOf(d: Date): number {
  const day = d.getUTCDay() || 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (day - 1) * 86400000
}

function expandEvent(ev: RawEvent, winStart: Date, winEnd: Date): IcsEvent[] {
  if (!ev.rrule) {
    return ev.start >= winStart && ev.start < winEnd ? [master(ev)] : []
  }

  const r = parseRrule(ev.rrule)
  const freq = r.FREQ
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return [] // YEARLY/MONTHLY no aplican al caso real (all-day / raros)

  const interval = r.INTERVAL ? parseInt(r.INTERVAL, 10) : 1
  const until = r.UNTIL ? parseIcsDate(r.UNTIL).date : null
  const count = r.COUNT ? parseInt(r.COUNT, 10) : null
  const byday = r.BYDAY ? r.BYDAY.split(',').map((c) => c.replace(/^[-+]?\d/, '')) : [DAY_CODES[ev.start.getUTCDay()]]

  const results: IcsEvent[] = []
  let emitted = 0
  // Con COUNT hay que contar desde el inicio de la serie; sin COUNT arrancamos
  // en la ventana para no iterar años de historia.
  const startDayMs = count
    ? Date.UTC(ev.start.getUTCFullYear(), ev.start.getUTCMonth(), ev.start.getUTCDate())
    : Math.max(mondayOf(ev.start), mondayOf(winStart))
  const dtstartMonday = mondayOf(ev.start)

  let cursor = startDayMs
  const hardEnd = Math.min(winEnd.getTime(), until ? until.getTime() + 86400000 : Infinity)
  let guard = 0

  while (cursor < hardEnd && guard < 1000) {
    guard++
    const cur = new Date(cursor)
    const beforeSeriesStart = cursor < Date.UTC(ev.start.getUTCFullYear(), ev.start.getUTCMonth(), ev.start.getUTCDate())

    let matches = false
    if (!beforeSeriesStart) {
      if (freq === 'WEEKLY') {
        const weeksDiff = Math.round((mondayOf(cur) - dtstartMonday) / (7 * 86400000))
        matches = weeksDiff % interval === 0 && byday.includes(DAY_CODES[cur.getUTCDay()])
      } else {
        // DAILY
        const daysDiff = Math.round(
          (Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()) -
            Date.UTC(ev.start.getUTCFullYear(), ev.start.getUTCMonth(), ev.start.getUTCDate())) /
            86400000
        )
        matches = daysDiff % interval === 0
      }
    }

    if (matches) {
      if (count && emitted >= count) break
      emitted++
      const occ = occurrenceAt(ev, cur, emitted)
      const inWindow = occ.start >= winStart && occ.start < winEnd
      const notExcluded = !ev.exdates.has(ymd(occ.start))
      const withinUntil = !until || occ.start <= until
      if (inWindow && notExcluded && withinUntil) results.push(occ)
    }
    cursor += 86400000
  }
  return results
}

/**
 * Sin `window`: devuelve un IcsEvent por VEVENT (el maestro de la serie) —
 * comportamiento base para lectura simple. Con `window`: expande recurrencias
 * (WEEKLY/DAILY) a instancias concretas dentro del rango.
 */
export function parseIcs(raw: string, window?: { start: Date; end: Date }): IcsEvent[] {
  const raws = parseRawEvents(raw)
  if (!window) return raws.map(master)

  // RECURRENCE-ID: un evento con esta propiedad es un override de una instancia
  // puntual de su serie (mismo UID). La serie NO debe generar esa fecha; el
  // override la provee con su propio DTSTART (que pudo moverse de hora).
  const overrideDates = new Map<string, Set<string>>()
  for (const ev of raws) {
    if (ev.recurrenceId) {
      if (!overrideDates.has(ev.uid)) overrideDates.set(ev.uid, new Set())
      overrideDates.get(ev.uid)!.add(ev.recurrenceId)
    }
  }

  const out: IcsEvent[] = []
  for (const ev of raws) {
    if (ev.rrule) {
      const extra = overrideDates.get(ev.uid)
      if (extra) for (const d of extra) ev.exdates.add(d)
      out.push(...expandEvent(ev, window.start, window.end))
    } else if (ev.start >= window.start && ev.start < window.end) {
      out.push(master(ev)) // evento único u override de una instancia
    }
  }

  // Red de seguridad: colapsa cualquier duplicado exacto (misma fecha, hora y
  // título) — evita doble conteo de horas en la capacidad.
  const seen = new Set<string>()
  return out.filter((e) => {
    const k = `${ymd(e.start)}|${e.start.getUTCHours()}:${e.start.getUTCMinutes()}|${e.summary}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
