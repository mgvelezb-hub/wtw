import Link from 'next/link'

/**
 * URL que no existe (o `notFound()` fuera del grupo `(app)`). Se pinta sin
 * AppShell, así que el enlace a /dia es la única salida — y dentro del
 * cascarón, la única que hay.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="bloque w-full max-w-md p-6">
        <h1 className="text-lg font-semibold text-ink">Esta pantalla no existe</h1>
        <p className="mt-2 text-sm text-muted">
          La dirección no corresponde a ningún módulo de la app. Puede ser una ruta archivada o
          un enlace viejo.
        </p>
        <Link
          href="/dia"
          className="mt-5 inline-flex min-h-11 items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-sobre-brand hover:bg-brand-strong"
        >
          Ir a Mi Día
        </Link>
      </div>
    </main>
  )
}
