// La marca de Reckon: los dos rumbos que salen del mismo origen.
//
// Viene de *dead reckoning* — navegar midiendo tu propia velocidad y tiempo
// cuando no ves tierra. El trazo punteado es lo que planeaste, el sólido lo que
// pasó, y el segmento corto que une sus puntas es el factor de realismo. Es el
// número que la app existe para medir, dibujado.
//
// Sin `currentColor` a propósito: cada trazo tiene su papel semántico —el plan
// es terciario, lo real es la marca— y perderlo lo dejaría en una flecha.
export function Marca({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      className={className}
      role="img"
      aria-label="Reckon"
    >
      <circle cx="8" cy="44" r="3.5" fill="var(--brand)" />
      <path
        d="M8 44 L44 12"
        fill="none"
        stroke="var(--faint)"
        strokeWidth="2.5"
        strokeDasharray="4 3.5"
        strokeLinecap="round"
      />
      <path d="M8 44 L46 27" fill="none" stroke="var(--brand)" strokeWidth="5" strokeLinecap="round" />
      <path d="M44 12 L46 27" fill="none" stroke="var(--brand-text)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
