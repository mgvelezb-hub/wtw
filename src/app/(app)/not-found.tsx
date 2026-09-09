import Link from 'next/link'

/**
 * `notFound()` dentro de la app (un id que no es del usuario, una ruta
 * archivada por flag). Vive bajo el AppShell a propósito: la navegación sigue
 * a la vista, así que no hace falta un botón para cada salida.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div className="bloque w-full max-w-md p-6">
        <h1 className="text-lg font-semibold text-ink">Aquí no hay nada</h1>
        <p className="mt-2 text-sm text-muted">
          Ese registro no existe, no es tuyo, o el módulo está archivado.
        </p>
        <Link
          href="/dia"
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-sobre-brand hover:bg-brand-strong"
        >
          Ir a Mi Día
        </Link>
      </div>
    </div>
  )
}
