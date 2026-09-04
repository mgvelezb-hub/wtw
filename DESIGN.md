# DESIGN.md — WTW App

> Extraído del código el 2026-09-04 (`src/app/globals.css` y el uso real en las
> pantallas). La fuente de verdad son los tokens; esto los explica.

## Color

Un solo juego de neutros con **sesgo teal** — el mismo sesgo del acento, no un
gris de fábrica. Solo modo claro, declarado con `color-scheme: light` a
propósito: sin eso, iOS y Chrome pintan inputs con su tema oscuro y el texto
queda casi invisible aunque el CSS nunca lo pida.

| Rol | Token | Valor | Uso |
|---|---|---|---|
| Fondo de la app | `paper` | `#eef2f2` | El lienzo sobre el que flota todo |
| Superficie de trabajo | `surface` | `#ffffff` | Columnas, filas, bloques |
| Texto principal | `ink` | `#1a2323` | |
| Texto secundario | `muted` | `#5c6b6a` | |
| Texto terciario | `faint` | `#9fb0ae` | |
| Línea entre filas | `hair` | `#dce4e2` | DENTRO de un área |
| Borde de área | `edge` | `#ccdad8` | Delimita un área de otra |

**Gramática: un color, un significado.** `brand` (teal `#0a7c82`) es el ÚNICO
acento: acción primaria, selección, identidad. `warn` (ámbar) solo advertencias
— nunca un botón, nunca un chip decorativo. `danger` (rojo) solo destructivo o
atrasado. `ok` (verde) solo confirmación.

Estrategia de color: **restrained**. El acento no pasa del 10% de la superficie.

Historia que no hay que repetir: `paper` fue crema `#f4efe3` a pantalla completa
hasta el 2026-08-24. En monitor, una superficie cálida de pared a pared aplana
todo y las áreas dejan de distinguirse. La corrección fue al revés de lo que
parecía: fondo más frío, superficies blancas, y `edge` para delimitar.

## Typography

IBM Plex Sans para texto, IBM Plex Mono para números. Dos utilidades cargan casi
toda la identidad:

- `.num` — Plex Mono con `tabular-nums`, en **todo** número que se lea en
  columna o se compare (horas, factores, porcentajes, contadores).
- `.lbl` — 11px, 600, `letter-spacing: .1em`, mayúsculas, color `muted`. Es la
  etiqueta de sección que sustituyó a los h2 en negritas.

El rem base sube con el ancho (17px ≥1280, 18px ≥1600): la app se diseñó sobre
iPad y en monitor la misma letra se sentía chica. La geometría del lienzo (px
fijos, 64px por hora) no escala.

## Elevation

**Cero sombras.** La separación la dan el borde (`edge`) y el cambio de
superficie. La utilidad `.bloque` (surface + edge + radio 10px) es el
"scorecard" que sustituyó a la card con sombra. Regla: cada pieza de contenido
lleva borde propio; la jerarquía la da el contraste fondo/superficie.

Excepción viva: los menús flotantes (`components/menu-flotante.tsx`) sí llevan
`shadow-lg`, porque de verdad flotan sobre el contenido en un portal.

## Components

- **Lienzo de tiempo** (`semana/lienzo.ts`): geometría pura, sin React ni
  Prisma. 64px = 1 hora, drop con snap de 15 min, resize en pasos de 30.
- **Menú ⋯ flotante** (`components/menu-flotante.tsx` + `lib/menu-geometria.ts`):
  portal a `document.body`, `fixed` recalculado en scroll, volteo hacia arriba
  decidido por aritmética probada sin navegador.
- **Tour y ayuda contextual**: la guía de página se descarta y deja en su lugar
  un "?" del mismo tamaño. Una ayuda que se descarta para siempre obliga a
  leerla con miedo la primera vez.
