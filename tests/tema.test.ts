import { describe, it, expect } from 'vitest'
import { resolverTema, estaFueraDeJornada, colorScheme, type Contexto } from '@/lib/tema'

// Tres temas, no dos. El de "fuera de jornada" existe para decir algo que el
// oscuro deliberado no dice, así que la prueba central es que nunca se
// confundan: mismos minutos, distinta intención, distinto tema.

const JORNADA = { inicioMin: 9 * 60, finMin: 18 * 60 }

function ctx(p: Partial<Contexto> = {}): Contexto {
  return {
    preferencia: 'auto',
    sistemaOscuro: false,
    minutosAhora: 11 * 60,
    diaSemana: 2,
    jornada: JORNADA,
    avisarFueraDeJornada: true,
    ...p,
  }
}

describe('estaFueraDeJornada', () => {
  it('antes de abrir y después de cerrar', () => {
    expect(estaFueraDeJornada(8 * 60 + 59, 2, JORNADA)).toBe(true)
    expect(estaFueraDeJornada(9 * 60, 2, JORNADA)).toBe(false)
    expect(estaFueraDeJornada(17 * 60 + 59, 2, JORNADA)).toBe(false)
    // Las 18:00 en punto ya es fuera: la jornada termina, no incluye su borde.
    expect(estaFueraDeJornada(18 * 60, 2, JORNADA)).toBe(true)
  })

  it('el fin de semana no cuenta como fuera de jornada para el tema', () => {
    // La señal de erosión sí cuenta el sábado, pero son preguntas distintas: un
    // sábado entero en cálido deja de significar algo por saturación.
    expect(estaFueraDeJornada(11 * 60, 6, JORNADA)).toBe(false)
    expect(estaFueraDeJornada(23 * 60, 0, JORNADA)).toBe(false)
  })
})

describe('resolverTema', () => {
  it('una elección explícita gana sobre la hora y sobre el sistema', () => {
    expect(resolverTema(ctx({ preferencia: 'claro', minutosAhora: 23 * 60, sistemaOscuro: true }))).toBe('claro')
    expect(resolverTema(ctx({ preferencia: 'oscuro', minutosAhora: 11 * 60, sistemaOscuro: false }))).toBe('oscuro')
  })

  it('en automático y dentro de jornada, manda el sistema', () => {
    expect(resolverTema(ctx({ sistemaOscuro: false }))).toBe('claro')
    expect(resolverTema(ctx({ sistemaOscuro: true }))).toBe('oscuro')
  })

  it('fuera de jornada entra el tercer tema, no el oscuro', () => {
    // Es la distinción que justifica que sean tres: a las 20:00 con el sistema
    // en oscuro, "oscuro" y "fuera" serían el mismo pixel si no se separaran.
    expect(resolverTema(ctx({ minutosAhora: 20 * 60, sistemaOscuro: true }))).toBe('fuera')
    expect(resolverTema(ctx({ minutosAhora: 20 * 60, sistemaOscuro: false }))).toBe('fuera')
  })

  it('sin la casilla, fuera de jornada se comporta como siempre', () => {
    expect(resolverTema(ctx({ minutosAhora: 20 * 60, avisarFueraDeJornada: false, sistemaOscuro: true }))).toBe('oscuro')
    expect(resolverTema(ctx({ minutosAhora: 20 * 60, avisarFueraDeJornada: false, sistemaOscuro: false }))).toBe('claro')
  })

  it('el sábado en automático sigue al sistema aunque sean las 8 de la noche', () => {
    expect(resolverTema(ctx({ diaSemana: 6, minutosAhora: 20 * 60, sistemaOscuro: false }))).toBe('claro')
  })
})

describe('colorScheme', () => {
  it('los dos temas oscuros declaran dark, o iOS pinta los inputs a su modo', () => {
    expect(colorScheme('claro')).toBe('light')
    expect(colorScheme('oscuro')).toBe('dark')
    expect(colorScheme('fuera')).toBe('dark')
  })
})
