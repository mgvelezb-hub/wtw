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
    const folded = SAMPLE.replace('SUMMARY:Junta con cliente', 'SUMMARY:Junta con\r\n cliente largo')
    const events = parseIcs(folded)
    expect(events[0].summary).toBe('Junta con cliente largo')
  })
  it('devuelve array vacío si no hay VEVENT', () => {
    expect(parseIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toEqual([])
  })
})
