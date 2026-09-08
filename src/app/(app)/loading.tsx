/**
 * Se pinta DENTRO del AppShell (el layout ya resolvió), así que la navegación
 * sigue viva mientras el servidor arma la pantalla. Existe sobre todo por el
 * cold start de Neon: sin esto, tocar un módulo en el iPad no da señal alguna
 * durante segundos y se toca dos veces.
 */
export default function Loading() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-6 w-48 animate-pulse rounded bg-hair" />
      <div className="bloque h-40 animate-pulse" />
      <div className="bloque h-24 animate-pulse" />
    </div>
  )
}
