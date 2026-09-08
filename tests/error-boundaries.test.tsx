import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Error from '@/app/(app)/error'
import GlobalError from '@/app/global-error'
import NotFound from '@/app/not-found'

// Estos archivos son la única red de seguridad del cascarón, donde no hay
// barra de direcciones: si un 500 se pinta sin salida, el usuario tiene que
// matar la app. Lo que se prueba es justo eso — que siempre haya una salida
// visible y que el mensaje no invente que se perdió tiempo medido.
//
// `renderToStaticMarkup` no corre efectos ni handlers; alcanza para el
// contrato de marcado. El comportamiento de `reset()` lo da React.

const boom = Object.assign(new global.Error('boom'), { digest: 'abc123' })

describe('error de ruta', () => {
  const html = renderToStaticMarkup(<Error error={boom} reset={() => {}} />)

  it('se anuncia como alerta', () => {
    expect(html).toContain('role="alert"')
  })

  it('ofrece reintentar y una salida a /dia', () => {
    expect(html).toContain('Reintentar')
    expect(html).toContain('href="/dia"')
  })

  it('muestra el digest para poder rastrear el 500', () => {
    expect(html).toContain('abc123')
  })

  it('no afirma que se haya perdido tiempo medido', () => {
    expect(html).toContain('Nada de lo que cronometraste se perdió')
  })
})

describe('error global', () => {
  const html = renderToStaticMarkup(<GlobalError error={boom} reset={() => {}} />)

  it('reemplaza el documento entero', () => {
    expect(html).toContain('<html')
    expect(html).toContain('<body')
  })

  it('trae color propio por si falló el CSS', () => {
    expect(html).toContain('#eef2f2')
  })

  it('ofrece las dos salidas', () => {
    expect(html).toContain('Reintentar')
    expect(html).toContain('href="/dia"')
  })
})

describe('not found', () => {
  it('sale a /dia', () => {
    expect(renderToStaticMarkup(<NotFound />)).toContain('href="/dia"')
  })
})
