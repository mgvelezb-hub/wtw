'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Red de seguridad de las rutas de la app.
 *
 * Dentro del cascarón nativo NO hay barra de direcciones ni botón de recarga:
 * la pantalla de error por default de Next deja al usuario sin salida más que
 * matar la app. Por eso aquí siempre hay dos salidas visibles — reintentar el
 * render y volver a /dia — y el mensaje dice qué pasó con lo que estaba
 * cronometrando, que es la única pregunta real cuando esto aparece.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[wtw] error de ruta', error)
  }, [error])

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div className="bloque w-full max-w-md p-6" role="alert">
        <h1 className="text-lg font-semibold text-ink">Algo se rompió al cargar esta pantalla</h1>
        <p className="mt-2 text-sm text-muted">
          Nada de lo que cronometraste se perdió: el tiempo vive en el servidor, no en esta
          pantalla. Si la base estaba dormida, reintentar suele bastar.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted">Referencia: {error.digest}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-sobre-brand hover:bg-brand-strong"
          >
            Reintentar
          </button>
          <Link
            href="/dia"
            className="inline-flex min-h-11 items-center rounded-md border border-edge bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-paper"
          >
            Ir a Mi Día
          </Link>
        </div>
      </div>
    </div>
  )
}
