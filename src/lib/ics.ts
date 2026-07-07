export type IcsEvent = {
  uid: string
  summary: string
  start: Date
  end: Date
  allDay: boolean
}

function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function parseIcsDate(value: string, isDateOnly: boolean): Date {
  const y = +value.slice(0, 4)
  const m = +value.slice(4, 6)
  const d = +value.slice(6, 8)
  if (isDateOnly) return new Date(Date.UTC(y, m - 1, d))
  const hh = +value.slice(9, 11)
  const mm = +value.slice(11, 13)
  const ss = +value.slice(13, 15) || 0
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
}

export function parseIcs(raw: string): IcsEvent[] {
  const lines = unfold(raw).split(/\r?\n/)
  const events: IcsEvent[] = []
  let cur: Partial<IcsEvent> = {}
  let inEvent = false

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur.uid && cur.start && cur.end) events.push(cur as IcsEvent)
      inEvent = false
      continue
    }
    if (!inEvent) continue

    const [rawKey, ...rest] = line.split(':')
    const value = rest.join(':')
    const [key, ...params] = rawKey.split(';')
    const isDateOnly = params.some((p) => p === 'VALUE=DATE')

    if (key === 'UID') cur.uid = value
    else if (key === 'SUMMARY') cur.summary = value
    else if (key === 'DTSTART') {
      cur.start = parseIcsDate(value, isDateOnly)
      cur.allDay = isDateOnly
    } else if (key === 'DTEND') cur.end = parseIcsDate(value, isDateOnly)
  }
  return events
}
