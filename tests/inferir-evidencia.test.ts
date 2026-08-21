import { describe, it, expect } from 'vitest'
import { normalizarSugerencias, MAX_SUGERENCIAS } from '@/lib/ai/normalizar-evidencia'
import { extraerJSON } from '@/app/(app)/semana/nueva/parse-json'

// Solo la parte determinista. El llamado real al modelo no se prueba aquí — los
// evals viven aparte y corren bajo demanda (tests/ai/*, EVAL=1).
//
// Lo que sí se prueba es la asimetría del feature: como cada sugerencia se
// confirma con UN tap y alimenta la rúbrica que decide una promoción, una
// sugerencia inventada cuesta más que una perdida. Todos los casos de abajo
// verifican que la duda se resuelve descartando.

const VALIDAS = ['comp-1', 'comp-2', 'comp-3', 'comp-4']

describe('normalizarSugerencias', () => {
  it('conserva una sugerencia bien formada', () => {
    const r = normalizarSugerencias(
      [{ competencyId: 'comp-1', nota: 'Cuestionó el supuesto de 4 vueltas con el dato de Ferman', confianza: 'alta' }],
      VALIDAS
    )
    expect(r).toEqual([
      { competencyId: 'comp-1', nota: 'Cuestionó el supuesto de 4 vueltas con el dato de Ferman', confianza: 'alta' },
    ])
  })

  it('descarta un competencyId que no existe en el catálogo', () => {
    // No cae a un default como el tipo de item de minuta: adivinar el reactivo
    // acredita el trabajo en la casilla equivocada y revienta la FK de Evidence.
    const r = normalizarSugerencias(
      [
        { competencyId: 'comp-inventado', nota: 'algo que sonaba bien', confianza: 'alta' },
        { competencyId: 'comp-2', nota: 'esta sí existe', confianza: 'media' },
      ],
      VALIDAS
    )
    expect(r).toHaveLength(1)
    expect(r[0].competencyId).toBe('comp-2')
  })

  it('descarta competencyId vacío, de puro espacio o que no es string', () => {
    for (const malo of ['', '   ', null, 42, undefined, {}]) {
      const r = normalizarSugerencias([{ competencyId: malo, nota: 'x' }], VALIDAS)
      expect(r, `debió descartar ${JSON.stringify(malo)}`).toEqual([])
    }
  })

  it('filtra notas vacías: sin episodio no hay evidencia', () => {
    const r = normalizarSugerencias(
      [
        { competencyId: 'comp-1', nota: '' },
        { competencyId: 'comp-2', nota: '   ' },
        { competencyId: 'comp-3' },
        { competencyId: 'comp-4', nota: 'esta sí trae episodio' },
      ],
      VALIDAS
    )
    expect(r).toHaveLength(1)
    expect(r[0].competencyId).toBe('comp-4')
  })

  it('corta a MAX_SUGERENCIAS aunque el modelo mande más', () => {
    const muchas = ['comp-1', 'comp-2', 'comp-3', 'comp-4'].map((id) => ({
      competencyId: id,
      nota: `episodio de ${id}`,
      confianza: 'alta',
    }))
    const r = normalizarSugerencias(muchas, VALIDAS)
    expect(MAX_SUGERENCIAS).toBe(3)
    expect(r).toHaveLength(3)
    expect(r.map((s) => s.competencyId)).toEqual(['comp-1', 'comp-2', 'comp-3'])
  })

  it('las descartadas no consumen cupo de las 3', () => {
    // Si el filtrado ocurriera después del corte, dos ids inventados al inicio
    // dejarían fuera sugerencias buenas.
    const r = normalizarSugerencias(
      [
        { competencyId: 'fantasma-1', nota: 'x' },
        { competencyId: 'fantasma-2', nota: 'y' },
        { competencyId: 'comp-1', nota: 'buena 1' },
        { competencyId: 'comp-2', nota: 'buena 2' },
        { competencyId: 'comp-3', nota: 'buena 3' },
      ],
      VALIDAS
    )
    expect(r.map((s) => s.competencyId)).toEqual(['comp-1', 'comp-2', 'comp-3'])
  })

  it('deduplica el mismo reactivo: dos evidencias del mismo episodio inflan la cobertura', () => {
    const r = normalizarSugerencias(
      [
        { competencyId: 'comp-1', nota: 'primera lectura' },
        { competencyId: 'comp-1', nota: 'la misma junta otra vez' },
        { competencyId: 'comp-2', nota: 'otro reactivo' },
      ],
      VALIDAS
    )
    expect(r).toHaveLength(2)
    expect(r[0].nota).toBe('primera lectura')
  })

  it('una confianza inventada cae a media, nunca a alta', () => {
    // El default no debe empujar a confirmar sin leer.
    for (const mala of ['altísima', 'baja', 'ALTA', '', 1, null, undefined]) {
      const r = normalizarSugerencias([{ competencyId: 'comp-1', nota: 'x', confianza: mala }], VALIDAS)
      expect(r[0].confianza, `debió caer a media con ${JSON.stringify(mala)}`).toBe('media')
    }
  })

  it('acepta las dos confianzas del contrato', () => {
    const r = normalizarSugerencias(
      [
        { competencyId: 'comp-1', nota: 'a', confianza: 'alta' },
        { competencyId: 'comp-2', nota: 'b', confianza: 'media' },
      ],
      VALIDAS
    )
    expect(r.map((s) => s.confianza)).toEqual(['alta', 'media'])
  })

  it('colapsa saltos de línea y espacios en la nota', () => {
    const r = normalizarSugerencias(
      [{ competencyId: 'comp-1', nota: '  Presentó el glidepath\n\n  ante Carlos Sierra.  ' }],
      VALIDAS
    )
    expect(r[0].nota).toBe('Presentó el glidepath ante Carlos Sierra.')
  })

  it('devuelve lista vacía si la IA no mandó un array', () => {
    expect(normalizarSugerencias(null, VALIDAS)).toEqual([])
    expect(normalizarSugerencias({ sugerencias: [] }, VALIDAS)).toEqual([])
    expect(normalizarSugerencias('no encontré nada', VALIDAS)).toEqual([])
  })

  it('ignora entradas que no son objetos sin tirar el resto', () => {
    const r = normalizarSugerencias(['basura', null, 7, { competencyId: 'comp-2', nota: 'sobrevive' }], VALIDAS)
    expect(r).toHaveLength(1)
    expect(r[0].competencyId).toBe('comp-2')
  })

  it('con catálogo vacío no sobrevive ninguna sugerencia', () => {
    // Es el caso del usuario sin nivel objetivo: mejor cero que acreditar contra
    // un reactivo que no le aplica.
    expect(normalizarSugerencias([{ competencyId: 'comp-1', nota: 'x' }], [])).toEqual([])
  })
})

describe('parseo de la respuesta cruda + normalización', () => {
  it('sobrevive a la respuesta envuelta en fences', () => {
    const crudo = extraerJSON<unknown>(
      '```json\n[{"competencyId":"comp-1","nota":"Destrabó la decisión de tarifa","confianza":"alta"}]\n```'
    )
    const r = normalizarSugerencias(crudo, VALIDAS)
    expect(r).toHaveLength(1)
    expect(r[0].nota).toBe('Destrabó la decisión de tarifa')
  })

  it('el array vacío —la respuesta correcta y frecuente— no rompe nada', () => {
    expect(normalizarSugerencias(extraerJSON<unknown>('[]'), VALIDAS)).toEqual([])
  })

  it('una respuesta en prosa no produce sugerencias', () => {
    expect(normalizarSugerencias(extraerJSON<unknown>('No encontré evidencia en esta junta.'), VALIDAS)).toEqual([])
  })
})
