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
    expect(evs[0].start.getUTCHours()).toBe(14)
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
