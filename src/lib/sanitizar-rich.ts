import 'server-only'
import sanitizeHtml from 'sanitize-html'

// El HTML de las minutas se pinta con `dangerouslySetInnerHTML`. Hoy el único
// autor de una minuta es quien la lee, así que un script inyectado sería
// self-XSS; con el segundo anillo de usuarios de PRODUCT.md —una minuta que un
// colega ve en /proyectos— deja de serlo, y para entonces el HTML sucio ya
// estaría guardado en la base.
//
// La lista blanca es exactamente lo que produce el editor (StarterKit +
// TextStyleKit + TableKit), ni más ni menos: cualquier etiqueta que llegue y no
// esté aquí no la escribió el editor.
//
// Se aplica en dos puntos, a propósito: al GUARDAR, que es donde deja de entrar
// basura nueva, y al PROYECTAR la vista, que es lo que cubre las filas que ya
// estaban guardadas antes de esto.
const CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr',
    'strong', 'b', 'em', 'i', 's', 'u', 'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a',
  ],
  allowedAttributes: {
    // TextStyleKit escribe color y tamaño como `style` en un span.
    span: ['style'],
    td: ['colspan', 'rowspan', 'colwidth'],
    th: ['colspan', 'rowspan', 'colwidth'],
    // `rel` y `target` los pone `transformTags`; si no están permitidos, el
    // propio saneado los borra justo después de agregarlos.
    a: ['href', 'title', 'rel', 'target'],
  },
  // Sin esto, `style` deja pasar cualquier cosa — incluido `url(javascript:…)`.
  allowedStyles: {
    '*': {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
      'font-size': [/^\d+(\.\d+)?(px|rem|em|%)$/],
    },
  },
  // `javascript:` en un href es la otra mitad del mismo agujero.
  allowedSchemes: ['http', 'https', 'mailto'],
  // Un enlace en una minuta puede apuntar a cualquier lado: que no arrastre la
  // sesión de la app al sitio destino.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
}

export function sanitizarRich(html: string): string
export function sanitizarRich(html: string | null): string | null
export function sanitizarRich(html: string | null): string | null {
  if (html === null) return null
  return sanitizeHtml(html, CONFIG)
}
