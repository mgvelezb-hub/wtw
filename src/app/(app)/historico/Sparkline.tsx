type Point = { x: number; y: number }

type SparklineProps = {
  values: (number | null)[]
  width?: number
  height?: number
}

const DEFAULT_WIDTH = 100
const DEFAULT_HEIGHT = 28
const PADDING = 3
const RADIUS = 2.5

// Divide la serie en tramos de valores consecutivos no-null — un hueco (null)
// corta el tramo en vez de interpolar sobre datos que no existen.
function toSegments(coords: (Point | null)[]): Point[][] {
  const segments: Point[][] = []
  let current: Point[] = []
  for (const c of coords) {
    if (c === null) {
      if (current.length > 0) segments.push(current)
      current = []
    } else {
      current.push(c)
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/** Sparkline SVG sin librerías. Soporta series de 1 punto y huecos (null). */
export function Sparkline({ values, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }: SparklineProps) {
  const known = values.filter((v): v is number => v !== null)
  if (known.length === 0) return null

  const min = Math.min(...known)
  const max = Math.max(...known)
  const range = max - min || 1
  const usableWidth = width - PADDING * 2
  const usableHeight = height - PADDING * 2
  const stepX = values.length > 1 ? usableWidth / (values.length - 1) : 0

  const coords: (Point | null)[] = values.map((v, i) => {
    if (v === null) return null
    const x = values.length === 1 ? width / 2 : PADDING + i * stepX
    const y = height - PADDING - ((v - min) / range) * usableHeight
    return { x, y }
  })

  const segments = toSegments(coords)
  const lastKnown = [...coords].reverse().find((c): c is Point => c !== null)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {segments.map((seg, i) =>
        seg.length > 1 ? (
          <polyline
            key={i}
            points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-brand"
          />
        ) : (
          <circle key={i} cx={seg[0].x} cy={seg[0].y} r={RADIUS - 1} className="fill-brand" />
        ),
      )}
      {lastKnown && <circle cx={lastKnown.x} cy={lastKnown.y} r={RADIUS} className="fill-brand" />}
    </svg>
  )
}
