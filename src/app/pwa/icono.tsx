import { ImageResponse } from 'next/og'

// El icono sólido: teal pleno con la marca en blanco. En la pantalla de inicio
// del iPad compite con los iconos del sistema, casi todos de color pleno — el
// sólido se distingue a un metro, el claro se pierde.
//
// Dos diferencias con `components/marca.tsx`, y las dos son por tamaño:
//
// 1. NO lleva el trazo que une las puntas. En la marca grande ese segmento es
//    el factor de realismo; a 60 px cierra la figura y los dos rumbos dejan de
//    leerse como rumbos: se ven como un triángulo relleno.
// 2. El rumbo planeado va punteado de verdad, en segmentos. Bajarle la opacidad
//    no basta —sobre teal pleno se lee como relleno— y el punteado es lo que
//    dice "esto era la intención, no lo que pasó".
//
// Satori no dibuja `path`: cada trazo es un div girado, colocado por su CENTRO
// (el origen de transformación por default) y rotado su ángulo.

const BASE = 192
const ORIGEN = { x: 40, y: 150 }
const PLAN = { x: 156, y: 42 }
const REAL = { x: 158, y: 110 }

type Seg = { ax: number; ay: number; bx: number; by: number }

// Parte una línea en guiones sobre el lienzo base. `desde` deja libre el arranque:
// sin ese respiro el primer guión se encima con el trazo sólido y el vértice
// compartido —que es lo que dice "los dos rumbos salen del mismo punto"— se
// convierte en un borrón.
function puntear(
  a: { x: number; y: number },
  b: { x: number; y: number },
  guion: number,
  hueco: number,
  desde = 0
): Seg[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const total = Math.hypot(dx, dy)
  const paso = guion + hueco
  const segs: Seg[] = []
  for (let d = desde; d < total; d += paso) {
    const fin = Math.min(d + guion, total)
    // Un guión de sobra al final se ve como basura, no como puntos.
    if (fin - d < guion * 0.6) break
    segs.push({
      ax: a.x + (dx * d) / total,
      ay: a.y + (dy * d) / total,
      bx: a.x + (dx * fin) / total,
      by: a.y + (dy * fin) / total,
    })
  }
  return segs
}

function barra(s: Seg, grosor: number, opacidad: number, k: number, clave: string) {
  const dx = (s.bx - s.ax) * k
  const dy = (s.by - s.ay) * k
  const largo = Math.hypot(dx, dy)
  const g = grosor * k
  return (
    <div
      key={clave}
      style={{
        position: 'absolute',
        left: ((s.ax + s.bx) / 2) * k - largo / 2,
        top: ((s.ay + s.by) / 2) * k - g / 2,
        width: largo,
        height: g,
        borderRadius: g,
        background: '#ffffff',
        opacity: opacidad,
        transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`,
        display: 'flex',
      }}
    />
  )
}

export function iconoReckon(size: number): ImageResponse {
  const k = size / BASE

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0A7C82' }}>
        {puntear(ORIGEN, PLAN, 15, 11, 26).map((s, i) => barra(s, 8, 0.62, k, `p${i}`))}
        {barra({ ax: ORIGEN.x, ay: ORIGEN.y, bx: REAL.x, by: REAL.y }, 17, 1, k, 'real')}
      </div>
    ),
    { width: size, height: size }
  )
}
