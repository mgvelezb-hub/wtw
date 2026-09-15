import { describe, it, expect } from 'vitest'
import { sugerirClase, tokens } from '@/lib/sugerir-clase'
import { factorDeClase } from '@/lib/tipo-trabajo'

describe('tokens', () => {
  it('normaliza acentos, minúsculas y puntuación, y tira palabras vacías', () => {
    expect(tokens('Análisis de COSTOS por región')).toEqual(['analisis', 'costos', 'region'])
  })
  it('tira las palabras de menos de 3 letras — no discriminan nada', () => {
    expect(tokens('Deck v2 → comité')).toEqual(['deck', 'comite'])
  })
})

describe('sugerirClase · histórico del usuario', () => {
  const historico = [
    { titulo: 'Deck del comité de negociaciones', tipoTrabajo: 'deck' as const },
    { titulo: 'Modelo de costeo bottom-up', tipoTrabajo: 'analisis' as const },
  ]

  it('reconoce una tarea parecida a una que el usuario ya etiquetó', () => {
    const s = sugerirClase('Deck del comité de septiembre', historico)
    expect(s).toMatchObject({ tipo: 'deck', fuente: 'historico', porque: 'Deck del comité de negociaciones' })
  })

  it('el histórico gana sobre las semillas: usa el vocabulario del usuario', () => {
    // "sesión" es semilla de junta, pero en el histórico "modelo de costeo"
    // comparte dos palabras y pesa más.
    const s = sugerirClase('Sesión para revisar el modelo de costeo', historico)
    expect(s).toMatchObject({ tipo: 'analisis', fuente: 'historico' })
  })

  it('una sola palabra en común no basta — sería el cliente, no el tipo de trabajo', () => {
    const s = sugerirClase('Comité de dirección', [{ titulo: 'Deck del comité', tipoTrabajo: 'deck' as const }])
    // Cae a semillas: "comite" es semilla de junta.
    expect(s).toMatchObject({ tipo: 'junta', fuente: 'semilla' })
  })
})

describe('sugerirClase · arranque en frío', () => {
  it('clasifica con el vocabulario base cuando no hay histórico', () => {
    expect(sugerirClase('Armar la presentación del foro')?.tipo).toBe('deck')
    expect(sugerirClase('Correr el modelo en Python')?.tipo).toBe('analisis')
    expect(sugerirClase('Sesión de trabajo con Carlos')?.tipo).toBe('junta')
    expect(sugerirClase('Responder el correo de Mike')?.tipo).toBe('comunicacion')
    expect(sugerirClase('Facturar el entregable 4')?.tipo).toBe('gestion')
  })

  it('sin señal no inventa una clase', () => {
    expect(sugerirClase('Pendiente')).toBeNull()
    expect(sugerirClase('')).toBeNull()
  })
})

describe('factorDeClase', () => {
  const factores = {
    deck: { factor: 2.1, muestras: 5 },
    junta: { factor: 1.1, muestras: 4 },
    analisis: { factor: null, muestras: 2 },
  }

  it('usa el factor de la clase cuando esa clase ya tiene suficientes muestras', () => {
    expect(factorDeClase('deck', factores, 1.4)).toBe(2.1)
    expect(factorDeClase('junta', factores, 1.4)).toBe(1.1)
  })

  it('cae al factor global cuando la clase no tiene muestras suficientes', () => {
    // 'analisis' trae factor null: 2 de 3 muestras. Inventar una corrección con
    // dos tareas es exactamente lo que MIN_MUESTRAS existe para evitar.
    expect(factorDeClase('analisis', factores, 1.4)).toBe(1.4)
    expect(factorDeClase('gestion', factores, 1.4)).toBe(1.4)
  })

  it('una tarea sin clase usa el factor global', () => {
    expect(factorDeClase(null, factores, 1.4)).toBe(1.4)
    expect(factorDeClase('deck', null, 1.4)).toBe(1.4)
  })
})

describe('las clases agregadas el 2026-09-14', () => {
  // El catálogo original era de consultoría y la mitad del trabajo de hoy es
  // construir software: sin estas clases todo eso caía en `otro`, que juntaba
  // cosas que no se parecen y cuyo factor nunca iba a significar nada.
  it('reconoce desarrollo de software', () => {
    for (const t of [
      'Desarrollar el punto de venta',
      'Implementar el MCP: panel de leads en tiempo real',
      'Reparar la app en el celular de Irma',
      'Vista de entregables interactiva desde la app',
    ]) {
      expect(sugerirClase(t, [])?.tipo).toBe('desarrollo')
    }
  })

  it('reconoce las pruebas, donde el alcance se expande solo', () => {
    for (const t of ['Pruebas de impresora, tickets y escaneo de barras', 'Estresar el sistema']) {
      expect(sugerirClase(t, [])?.tipo).toBe('pruebas')
    }
  })

  it('separa actualizar datos de emitir un juicio', () => {
    // Es la separación que más vale: en el histórico, actualizar bases mide ×1.0
    // y armar un deck mide ×1.9. Revueltos en `analisis`, el promedio no
    // describe a ninguno de los dos.
    expect(sugerirClase('Actualizar Base de Costos para indicadores', [])?.tipo).toBe('datos')
    expect(sugerirClase('Análisis why-cause de costo y rendimiento', [])?.tipo).toBe('analisis')
  })

  it('el histórico del usuario sigue ganando sobre las semillas', () => {
    // La fuente buena es su vocabulario, no el mío.
    const s = sugerirClase('Pruebas con productos y cierre de caja', [
      { titulo: 'Pruebas con productos y ventas', tipoTrabajo: 'desarrollo' },
    ])
    expect(s?.tipo).toBe('desarrollo')
    expect(s?.fuente).toBe('historico')
  })
})
