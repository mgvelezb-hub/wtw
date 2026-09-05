import { describe, it, expect } from 'vitest'
import { instanteLocal, proximaOcurrencia, planLocal, ID_RITUAL, ID_CIERRE } from '@/lib/avisos-locales'
import { RECORDATORIOS_DEFAULT } from '@/lib/push'

const MX = 'America/Mexico_City'

describe('instanteLocal', () => {
  it('convierte fecha + hh:mm de una zona a instante UTC', () => {
    // CDMX sin horario de verano: UTC-6 fijo.
    expect(instanteLocal('2026-09-06', '18:00', MX).toISOString()).toBe('2026-09-07T00:00:00.000Z')
    expect(instanteLocal('2026-09-04', '17:30', MX).toISOString()).toBe('2026-09-04T23:30:00.000Z')
  })
  it('respeta zonas con offset positivo', () => {
    expect(instanteLocal('2026-09-04', '09:00', 'Europe/Madrid').toISOString()).toBe('2026-09-04T07:00:00.000Z')
  })
})

describe('proximaOcurrencia', () => {
  // Viernes 4-sep-2026 17:47 CDMX.
  const ahora = new Date('2026-09-04T23:47:00.000Z')
  it('el domingo 18:00 que viene', () => {
    expect(proximaOcurrencia(0, '18:00', ahora, MX).toISOString()).toBe('2026-09-07T00:00:00.000Z')
  })
  it('si hoy es el día y la hora ya pasó, salta a la semana siguiente', () => {
    // Viernes 17:30 ya pasó a las 17:47.
    expect(proximaOcurrencia(5, '17:30', ahora, MX).toISOString()).toBe('2026-09-11T23:30:00.000Z')
  })
  it('si hoy es el día y la hora no ha pasado, es hoy', () => {
    expect(proximaOcurrencia(5, '18:30', ahora, MX).toISOString()).toBe('2026-09-05T00:30:00.000Z')
  })
})

describe('planLocal', () => {
  const ahora = new Date('2026-09-04T15:00:00.000Z') // viernes 09:00 CDMX
  const estado = {
    isoWeekAPlanear: '2026-W37',
    semanaPlaneada: false,
    hoy: '2026-09-04',
    diaConPlan: true,
    yaReconciliado: false,
  }

  it('programa el ritual para su próxima ocurrencia solo si la semana sigue sin plan', () => {
    const avisos = planLocal(RECORDATORIOS_DEFAULT, ahora, MX, estado)
    const ritual = avisos.find((a) => a.id === ID_RITUAL)!
    expect(ritual.at).toBe('2026-09-07T00:00:00.000Z')
    expect(ritual.ruta).toBe('/semana/nueva?semana=2026-W37')
    expect(planLocal(RECORDATORIOS_DEFAULT, ahora, MX, { ...estado, semanaPlaneada: true }).some((a) => a.id === ID_RITUAL)).toBe(false)
  })

  it('programa el cierre de HOY si hay plan del día, no está reconciliado y la hora no pasó', () => {
    const avisos = planLocal(RECORDATORIOS_DEFAULT, ahora, MX, estado)
    const cierre = avisos.find((a) => a.id === ID_CIERRE)!
    expect(cierre.at).toBe('2026-09-04T23:30:00.000Z')
    expect(cierre.ruta).toBe('/cierre')
    expect(planLocal(RECORDATORIOS_DEFAULT, ahora, MX, { ...estado, diaConPlan: false }).some((a) => a.id === ID_CIERRE)).toBe(false)
    expect(planLocal(RECORDATORIOS_DEFAULT, ahora, MX, { ...estado, yaReconciliado: true }).some((a) => a.id === ID_CIERRE)).toBe(false)
  })

  it('el cierre no se programa en fin de semana ni cuando la hora ya pasó', () => {
    const sabado = new Date('2026-09-05T15:00:00.000Z')
    expect(planLocal(RECORDATORIOS_DEFAULT, sabado, MX, { ...estado, hoy: '2026-09-05' }).some((a) => a.id === ID_CIERRE)).toBe(false)
    const tarde = new Date('2026-09-04T23:45:00.000Z') // viernes 17:45, cierre era 17:30
    expect(planLocal(RECORDATORIOS_DEFAULT, tarde, MX, estado).some((a) => a.id === ID_CIERRE)).toBe(false)
  })

  it('apagados en Ajustes no programan nada', () => {
    expect(planLocal({ ritual: null, cierre: null }, ahora, MX, estado)).toEqual([])
  })
})
