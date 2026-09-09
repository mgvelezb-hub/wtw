import { describe, it, expect } from 'vitest'
import { sanitizarRich } from '@/lib/sanitizar-rich'

// El HTML de las minutas se pinta con `dangerouslySetInnerHTML`. Hoy sería
// self-XSS; con minutas que un colega ve en /proyectos deja de serlo, y para
// entonces el HTML sucio ya estaría guardado.

describe('sanitizarRich', () => {
  it('conserva lo que el editor sí produce', () => {
    const html =
      '<p><strong>Acuerdo</strong> con <em>Liverpool</em></p><ul><li>uno</li></ul>' +
      '<table><tbody><tr><td colspan="2">celda</td></tr></tbody></table>'
    expect(sanitizarRich(html)).toBe(html)
  })

  it('conserva color y tamaño de TextStyleKit', () => {
    const html = '<p><span style="color:#0A7C82;font-size:18px">teal</span></p>'
    const limpio = sanitizarRich(html)
    expect(limpio).toContain('color:#0A7C82')
    expect(limpio).toContain('font-size:18px')
  })

  it('quita el script y deja el texto', () => {
    expect(sanitizarRich('<p>hola</p><script>alert(1)</script>')).toBe('<p>hola</p>')
  })

  it('quita los manejadores de evento en línea', () => {
    const limpio = sanitizarRich('<p onclick="robar()">texto</p>')
    expect(limpio).not.toContain('onclick')
    expect(limpio).toContain('texto')
  })

  it('no deja pasar javascript: en un href', () => {
    expect(sanitizarRich('<a href="javascript:alert(1)">clic</a>')).not.toContain('javascript:')
  })

  it('un enlace real sobrevive y no arrastra la sesión al destino', () => {
    const limpio = sanitizarRich('<a href="https://vp.mx">VP</a>')
    expect(limpio).toContain('href="https://vp.mx"')
    expect(limpio).toContain('rel="noopener noreferrer"')
  })

  it('descarta un style con contenido inventado', () => {
    // Sin `allowedStyles`, `style` deja pasar cualquier cosa.
    const limpio = sanitizarRich('<span style="background:url(javascript:alert(1))">x</span>')
    expect(limpio).not.toContain('javascript')
  })

  it('null sigue siendo null — no todo item trae texto rico', () => {
    expect(sanitizarRich(null)).toBeNull()
  })
})
