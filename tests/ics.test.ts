import { describe, it, expect } from 'vitest'
import { parseIcs } from '@/lib/ics'

const SAMPLE = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt1@test
DTSTART:20260707T140000Z
DTEND:20260707T150000Z
SUMMARY:Junta con cliente
END:VEVENT
BEGIN:VEVENT
UID:evt2@test
DTSTART;VALUE=DATE:20260708
DTEND;VALUE=DATE:20260709
SUMMARY:Día completo
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  it('extrae eventos con hora (UTC → local fields)', () => {
    const events = parseIcs(SAMPLE)
    const evt = events.find((e) => e.uid === 'evt1@test')!
    expect(evt.summary).toBe('Junta con cliente')
    expect(evt.allDay).toBe(false)
  })
  it('detecta eventos de día completo (VALUE=DATE)', () => {
    const events = parseIcs(SAMPLE)
    const evt = events.find((e) => e.uid === 'evt2@test')!
    expect(evt.allDay).toBe(true)
  })
  it('ignora líneas plegadas (folding) reuniéndolas', () => {
    // El fold real inserta CRLF+WSP en cualquier punto, incluso a mitad de palabra —
    // el WSP es un artefacto a remover, no debe comerse contenido real.
    const folded = SAMPLE.replace('SUMMARY:Junta con cliente', 'SUMMARY:Junta con cli\r\n ente largo')
    const events = parseIcs(folded)
    expect(events[0].summary).toBe('Junta con cliente largo')
  })
  it('devuelve array vacío si no hay VEVENT', () => {
    expect(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual([])
  })
})

const WEEKLY = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:rec1
DTSTART:20260601T140000Z
DTEND:20260601T150000Z
SUMMARY:SCRUM semanal
RRULE:FREQ=WEEKLY;UNTIL=20261216T180000Z;INTERVAL=1;BYDAY=MO
END:VEVENT
END:VCALENDAR`

const win = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) })
const dias = (evs: { start: Date }[]) => evs.map((e) => e.start.toISOString().slice(0, 10))

describe('parseIcs — expansión de recurrencia', () => {
  it('expande serie semanal a instancias dentro de la ventana', () => {
    const evs = parseIcs(WEEKLY, win('2026-07-06T00:00:00Z', '2026-07-20T00:00:00Z'))
    expect(dias(evs)).toEqual(['2026-07-06', '2026-07-13'])
    expect(evs[0].summary).toBe('SCRUM semanal')
    // 14:00Z = 08:00 CDMX — la expectativa anterior (14) codificaba el bug de
    // leer la hora UTC como si fuera hora de pared local
    expect(evs[0].start.getUTCHours()).toBe(8)
  })

  it('respeta INTERVAL cada 2 semanas', () => {
    const evs = parseIcs(WEEKLY.replace('INTERVAL=1', 'INTERVAL=2'), win('2026-07-06T00:00:00Z', '2026-07-28T00:00:00Z'))
    expect(dias(evs)).toEqual(['2026-07-13', '2026-07-27'])
  })

  it('respeta UNTIL', () => {
    const evs = parseIcs(WEEKLY.replace('UNTIL=20261216T180000Z', 'UNTIL=20260710T180000Z'), win('2026-07-06T00:00:00Z', '2026-08-01T00:00:00Z'))
    expect(dias(evs)).toEqual(['2026-07-06'])
  })

  it('excluye instancias en EXDATE', () => {
    const src = WEEKLY.replace('SUMMARY:SCRUM semanal', 'SUMMARY:Con excepción\nEXDATE:20260713T140000Z')
    expect(dias(parseIcs(src, win('2026-07-06T00:00:00Z', '2026-07-20T00:00:00Z')))).toEqual(['2026-07-06'])
  })

  it('con ventana, evento no-recurrente solo aparece si cae dentro', () => {
    const src = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:one
DTSTART:20260607T140000Z
DTEND:20260607T150000Z
SUMMARY:Una vez
END:VEVENT
END:VCALENDAR`
    expect(parseIcs(src, win('2026-07-06T00:00:00Z', '2026-07-20T00:00:00Z'))).toHaveLength(0)
    expect(parseIcs(src, win('2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z'))).toHaveLength(1)
  })

  it('genera UID único por instancia', () => {
    const evs = parseIcs(WEEKLY, win('2026-07-06T00:00:00Z', '2026-07-20T00:00:00Z'))
    expect(new Set(evs.map((e) => e.uid)).size).toBe(evs.length)
  })
})

describe('parseIcs — zonas horarias', () => {
  function hhmm(d: Date) {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }

  it('convierte zona Cancún (UTC-5) a hora CDMX', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tz1@test
DTSTART;TZID=Eastern Standard Time (Mexico):20260715T130000
DTEND;TZID=Eastern Standard Time (Mexico):20260715T140000
SUMMARY:Sesión desde Cancún
END:VEVENT
END:VCALENDAR`
    const [e] = parseIcs(ics)
    expect(hhmm(e.start)).toBe('12:00') // 13:00 Cancún = 12:00 CDMX
    expect(hhmm(e.end)).toBe('13:00')
  })

  it('convierte US Central con horario de verano (CDT, UTC-5) a hora CDMX', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tz2@test
DTSTART;TZID=Central Standard Time:20260714T183000
DTEND;TZID=Central Standard Time:20260714T193000
SUMMARY:Revisión desde Chicago
END:VEVENT
END:VCALENDAR`
    const [e] = parseIcs(ics)
    expect(hhmm(e.start)).toBe('17:30') // 18:30 CDT (jul) = 17:30 CDMX
  })

  it('convierte UTC crudo (sufijo Z) a hora CDMX', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tz3@test
DTSTART:20260714T150000Z
DTEND:20260714T160000Z
SUMMARY:Evento en UTC
END:VEVENT
END:VCALENDAR`
    const [e] = parseIcs(ics)
    expect(hhmm(e.start)).toBe('09:00') // 15:00Z = 09:00 CDMX (UTC-6)
  })

  it('zona CDMX explícita queda idéntica (identidad)', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tz4@test
DTSTART;TZID=Central Standard Time (Mexico):20260715T090000
DTEND;TZID=Central Standard Time (Mexico):20260715T100000
SUMMARY:Junta local
END:VEVENT
END:VCALENDAR`
    const [e] = parseIcs(ics)
    expect(hhmm(e.start)).toBe('09:00')
  })

  it('sin TZID ni Z (hora flotante) se asume CDMX, sin cambio', () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:tz5@test
DTSTART:20260715T110000
DTEND:20260715T120000
SUMMARY:Flotante
END:VEVENT
END:VCALENDAR`
    const [e] = parseIcs(ics)
    expect(hhmm(e.start)).toBe('11:00')
  })
})
