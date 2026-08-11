import { describe, it, expect } from 'vitest'
import { normalizarItems } from '@/app/(app)/dia/normalizar-clasificacion'
import { extraerJSON } from '@/app/(app)/semana/nueva/parse-json'

// La IA se equivoca de formas concretas y conocidas. Cada caso de abajo es una de
// ellas: el objetivo no es que el modelo nunca falle, es que su falla no tire la
// clasificación completa ni guarde un dato equivocado.

describe('normalizarItems', () => {
  it('conserva un item bien formado', () => {
    const r = normalizarItems([
      { tipo: 'acuerdo', texto: 'Ferman acepta la reducción de tarifa', responsable: 'Ferman', fechaCompromiso: '2026-08-20' },
    ])
    expect(r).toEqual([
      { tipo: 'acuerdo', texto: 'Ferman acepta la reducción de tarifa', responsable: 'Ferman', fechaCompromiso: '2026-08-20' },
    ])
  })

  it('un tipo inventado cae a nota en vez de tirar el item', () => {
    // Perder la clasificación de un item es mejor que perder el item.
    const r = normalizarItems([{ tipo: 'compromiso_urgente', texto: 'algo importante que se dijo' }])
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('nota')
    expect(r[0].texto).toBe('algo importante que se dijo')
  })

  it('descarta una fecha que no sea YYYY-MM-DD en vez de guardarla mal', () => {
    // Un compromiso con fecha equivocada es peor que uno sin fecha.
    for (const mala of ['20 de agosto', '20/08/2026', 'octubre 2026', '2026-8-2', '']) {
      const r = normalizarItems([{ tipo: 'acuerdo', texto: 'x', fechaCompromiso: mala }])
      expect(r[0].fechaCompromiso, `debió descartar "${mala}"`).toBeUndefined()
    }
  })

  it('omite responsable vacío o de puro espacio', () => {
    expect(normalizarItems([{ tipo: 'nota', texto: 'x', responsable: '   ' }])[0].responsable).toBeUndefined()
    expect(normalizarItems([{ tipo: 'nota', texto: 'x' }])[0].responsable).toBeUndefined()
  })

  it('filtra items sin texto — no hay item que guardar', () => {
    const r = normalizarItems([
      { tipo: 'acuerdo', texto: '' },
      { tipo: 'acuerdo', texto: '   ' },
      { tipo: 'acuerdo' },
      { tipo: 'acuerdo', texto: 'este sí' },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].texto).toBe('este sí')
  })

  it('recorta espacios del texto y del responsable', () => {
    const r = normalizarItems([{ tipo: 'nota', texto: '  con espacios  ', responsable: '  Carlos  ' }])
    expect(r[0].texto).toBe('con espacios')
    expect(r[0].responsable).toBe('Carlos')
  })

  it('devuelve lista vacía si la IA no mandó un array', () => {
    expect(normalizarItems(null)).toEqual([])
    expect(normalizarItems({ items: [] })).toEqual([])
    expect(normalizarItems('texto suelto')).toEqual([])
  })

  it('ignora entradas que no son objetos, sin tirar el resto', () => {
    const r = normalizarItems(['basura', null, 42, { tipo: 'riesgo', texto: 'sobrevive' }])
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('riesgo')
  })

  it('acepta los 8 tipos del schema', () => {
    const tipos = ['acuerdo', 'decision', 'pendiente_nuestro', 'pendiente_cliente', 'solicitud_data', 'actividad_nueva', 'riesgo', 'nota']
    const r = normalizarItems(tipos.map((t) => ({ tipo: t, texto: `item ${t}` })))
    expect(r.map((i) => i.tipo)).toEqual(tipos)
  })
})

describe('parseo de la respuesta cruda + normalización', () => {
  it('sobrevive a la respuesta envuelta en fences, que el modelo agrega aunque se le prohíba', () => {
    const crudo = extraerJSON<unknown>('```json\n[{"tipo":"acuerdo","texto":"aceptan la reducción"}]\n```')
    const r = normalizarItems(crudo)
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('acuerdo')
  })

  it('sobrevive a una frase antes del JSON', () => {
    const crudo = extraerJSON<unknown>('Claro, aquí van los items: [{"tipo":"riesgo","texto":"flota al límite"}]')
    expect(normalizarItems(crudo)[0].texto).toBe('flota al límite')
  })

  it('una respuesta sin JSON no produce items', () => {
    expect(normalizarItems(extraerJSON<unknown>('No pude clasificar esto.'))).toEqual([])
  })
})
