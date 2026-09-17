import { describe, it, expect } from 'vitest'
import { reloj, duracion, horasTexto, horasDecimal } from '@/lib/duracion'

// El bug que fija este módulo: el cronómetro imprimía `20:00` para veinte
// minutos, justo encima de un plan que imprimía `0:30` para media hora. La fila
// se leía "planeé 30 minutos y me tardé 20 horas".
//
// La regla: la CANTIDAD DE SEGMENTOS dice qué estás leyendo.

describe('la regla de los segmentos', () => {
  it('veinte minutos nunca se ven iguales en los dos formatos', () => {
    expect(reloj(20 * 60)).toBe('0:20:00')
    expect(duracion(20)).toBe('0:20')
    // Ninguno de los dos produce "20:00", que era la forma ambigua.
    expect([reloj(20 * 60), duracion(20)]).not.toContain('20:00')
  })

  it('el cronómetro lleva la hora aunque sea cero', () => {
    // Es lo único que lo vuelve imposible de confundir con una duración.
    expect(reloj(45)).toBe('0:00:45')
    expect(reloj(90 * 60)).toBe('1:30:00')
  })
})

describe('duracion', () => {
  it('alinea en dos segmentos para comparar en columna', () => {
    expect(duracion(30)).toBe('0:30')
    expect(duracion(240)).toBe('4:00')
    expect(duracion(90)).toBe('1:30')
  })

  it('menos de un minuto medido no se redondea a cero', () => {
    // "No medí" y "medí poco" son cosas distintas, y el factor de realismo
    // depende de esa diferencia.
    expect(duracion(0.5)).toBe('<1m')
    expect(duracion(0)).toBe('0:00')
  })
})

describe('horasTexto', () => {
  it('es prosa, sin dos puntos', () => {
    expect(horasTexto(45)).toBe('45m')
    expect(horasTexto(120)).toBe('2h')
    expect(horasTexto(90)).toBe('1h 30m')
    expect(horasTexto(0)).toBe('0m')
  })

  it('no produce nada que se confunda con una hora del reloj', () => {
    // Dentro del lienzo, cuyo eje son horas, `1:30` se lee como la una y media.
    for (const m of [30, 90, 120, 455]) expect(horasTexto(m)).not.toContain(':')
  })
})

describe('horasDecimal', () => {
  it('totales grandes con un decimal', () => {
    expect(horasDecimal(1638)).toBe('27.3h')
    expect(horasDecimal(120)).toBe('2h')
  })
})
