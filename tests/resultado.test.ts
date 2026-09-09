import { describe, it, expect } from 'vitest'
import { intentar } from '@/lib/resultado'

// Next redacta el mensaje de una excepción que sale de una Server Action: un
// `throw new Error('la evidencia necesita una nota')` llegaba a la pantalla como
// una cadena opaca en inglés. El mensaje existía, estaba escrito en español, y
// el usuario nunca lo veía.

describe('intentar', () => {
  it('devuelve lo que produjo la función junto con ok', async () => {
    expect(await intentar(async () => ({ propuesta: { id: 'p1' } }))).toEqual({
      ok: true,
      propuesta: { id: 'p1' },
    })
  })

  it('convierte la excepción en un error legible en vez de dejarla salir', async () => {
    const r = await intentar(async () => {
      throw new Error('la evidencia necesita una nota')
    })
    expect(r).toEqual({ ok: false, error: 'la evidencia necesita una nota' })
  })

  it('usa el respaldo cuando lo lanzado no es un Error', async () => {
    const r = await intentar(async () => {
      throw 'algo raro'
    }, 'No se pudo registrar la evidencia.')
    expect(r).toEqual({ ok: false, error: 'No se pudo registrar la evidencia.' })
  })
})
