import { describe, it, expect } from 'vitest'
import { avisosDelTick, dentroDeVentana, isoWeekAPlanear, tickUnicoActivo } from '@/lib/recordatorios'
import { RECORDATORIOS_DEFAULT, leerRecordatorios } from '@/lib/push'

describe('dentroDeVentana', () => {
  it('abre en la hora configurada y dura menos que el intervalo del cron', () => {
    expect(dentroDeVentana('18:00', 18 * 60)).toBe(true)
    expect(dentroDeVentana('18:00', 18 * 60 + 14)).toBe(true)
    expect(dentroDeVentana('18:00', 18 * 60 + 15)).toBe(false)
    // Antes de la hora no se adelanta.
    expect(dentroDeVentana('18:00', 17 * 60 + 59)).toBe(false)
  })
})

describe('avisosDelTick', () => {
  it('el ritual solo cae en su día y en su ventana', () => {
    // Default: domingo 18:00.
    expect(avisosDelTick(RECORDATORIOS_DEFAULT, { diaSemana: 0, minutos: 18 * 60 })).toContain('ritual')
    expect(avisosDelTick(RECORDATORIOS_DEFAULT, { diaSemana: 0, minutos: 19 * 60 })).not.toContain('ritual')
    expect(avisosDelTick(RECORDATORIOS_DEFAULT, { diaSemana: 1, minutos: 18 * 60 })).not.toContain('ritual')
  })

  it('el cierre es de lunes a viernes: en fin de semana no empuja a trabajar', () => {
    const cierre = { ritual: null, cierre: { hora: '17:30' } }
    expect(avisosDelTick(cierre, { diaSemana: 5, minutos: 17 * 60 + 30 })).toEqual(['cierre'])
    expect(avisosDelTick(cierre, { diaSemana: 6, minutos: 17 * 60 + 30 })).toEqual([])
    expect(avisosDelTick(cierre, { diaSemana: 0, minutos: 17 * 60 + 30 })).toEqual([])
  })

  it('apagado es apagado: sin recordatorio configurado no hay aviso', () => {
    expect(avisosDelTick({ ritual: null, cierre: null }, { diaSemana: 0, minutos: 18 * 60 })).toEqual([])
  })

  it('los dos pueden caer en el mismo tick', () => {
    const r = { ritual: { dia: 5, hora: '17:30' }, cierre: { hora: '17:30' } }
    expect(avisosDelTick(r, { diaSemana: 5, minutos: 17 * 60 + 30 })).toEqual(['ritual', 'cierre'])
  })
})

describe('leerRecordatorios', () => {
  it('un usuario sin preferencia guardada arranca con los defaults', () => {
    expect(leerRecordatorios(null)).toEqual(RECORDATORIOS_DEFAULT)
    expect(leerRecordatorios(undefined)).toEqual(RECORDATORIOS_DEFAULT)
  })

  it('respeta el apagado explícito en vez de re-encender los defaults', () => {
    // La diferencia importa: `null` en la columna es "nunca lo configuró" y
    // `{ritual:null}` es "lo apagó a propósito". Confundirlos volvería a mandar
    // avisos que alguien ya dijo que no quiere.
    expect(leerRecordatorios({ ritual: null, cierre: null })).toEqual({ ritual: null, cierre: null })
  })

  it('conserva la hora y el día elegidos', () => {
    const guardado = { ritual: { dia: 5, hora: '16:00' }, cierre: { hora: '18:30' } }
    expect(leerRecordatorios(guardado)).toEqual(guardado)
  })
})

// La semana que el ritual va a planear. Sumar un día sin más —lo primero que
// escribí— fallaba en viernes y sábado: "mañana" sigue cayendo dentro de la
// misma semana ISO, así que el aviso comprobaba el plan de la semana que ya se
// está viviendo, la encontraba planeada y nunca salía.
describe('isoWeekAPlanear', () => {
  const VIERNES = new Date('2026-09-04T19:00:00Z')
  const DOMINGO = new Date('2026-09-06T19:00:00Z')
  const LUNES = new Date('2026-09-07T15:00:00Z')

  it('el lunes se planea la semana en curso', () => {
    expect(isoWeekAPlanear(LUNES, 1)).toBe('2026-W37')
  })

  it('el domingo se planea la semana que arranca al día siguiente', () => {
    expect(isoWeekAPlanear(DOMINGO, 0)).toBe('2026-W37')
  })

  it('el viernes también apunta a la semana que entra, no a la que se está viviendo', () => {
    expect(isoWeekAPlanear(VIERNES, 5)).toBe('2026-W37')
  })

  it('el sábado tampoco se queda en la semana en curso', () => {
    expect(isoWeekAPlanear(new Date('2026-09-05T19:00:00Z'), 6)).toBe('2026-W37')
  })
})

// Restricción de la cuenta, no de diseño: el plan Hobby de Vercel dispara un
// cron UNA vez al día, así que no hay forma de acertarle a la hora configurada.
// Con tick único manda el día y se ignora la hora. Degradación visible, no bug.
describe('tick único (plan Hobby)', () => {
  const r = { ritual: { dia: 0, hora: '18:00' }, cierre: { hora: '17:30' } }

  it('con un solo tick al día, la hora se ignora pero el DÍA se respeta', () => {
    // Domingo a las 23:30 UTC, que no es la ventana de las 18:00 locales.
    expect(avisosDelTick(r, { diaSemana: 0, minutos: 8 * 60 }, { tickUnico: true })).toEqual(['ritual'])
    // Sábado sigue sin recordatorio de cierre: eso no lo relaja el tick único.
    expect(avisosDelTick(r, { diaSemana: 6, minutos: 8 * 60 }, { tickUnico: true })).toEqual([])
  })

  it('sin tick único la hora vuelve a mandar', () => {
    expect(avisosDelTick(r, { diaSemana: 0, minutos: 8 * 60 })).toEqual([])
    expect(avisosDelTick(r, { diaSemana: 0, minutos: 18 * 60 })).toEqual(['ritual'])
  })

  it('el default es tick único: es lo que la cuenta permite hoy', () => {
    expect(tickUnicoActivo({})).toBe(true)
    expect(tickUnicoActivo({ RECORDATORIOS_TICK_UNICO: '0' })).toBe(false)
  })
})
