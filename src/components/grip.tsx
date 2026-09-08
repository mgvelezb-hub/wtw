import type { SVGProps } from 'react'

// El asa de arrastre: dos columnas de tres puntos, el glifo que en iOS significa
// "de aquí se toma". Antes era el texto "⋮⋮", que en Plex se ve fino y en el
// iPad pasaba por adorno; como SVG mide siempre igual y toma `currentColor`.
// El área de toque la pone quien lo usa (pseudo-elemento ~32 px): el dibujo no
// crece para no robarle alto a la fila.
export function Grip(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden {...props}>
      <circle cx="2.5" cy="3" r="1.5" />
      <circle cx="7.5" cy="3" r="1.5" />
      <circle cx="2.5" cy="8" r="1.5" />
      <circle cx="7.5" cy="8" r="1.5" />
      <circle cx="2.5" cy="13" r="1.5" />
      <circle cx="7.5" cy="13" r="1.5" />
    </svg>
  )
}
