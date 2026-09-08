'use client'

import { useEffect } from 'react'
import './globals.css'

/**
 * Último recurso: se monta cuando revienta el layout raíz, así que REEMPLAZA
 * al documento entero — html y body son responsabilidad de este archivo, y no
 * hay AppShell, ni fuentes de `next/font`, ni sesión.
 *
 * Los colores van inline además de por token: si lo que falló fue el pipeline
 * de CSS, una pantalla sin estilo tiene que seguir siendo legible.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[wtw] error global', error)
  }, [error])

  return (
    <html lang="es-MX" className="h-full">
      <body
        className="min-h-dvh"
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#eef2f2',
          color: '#1a2323',
          font: '17px/1.45 "IBM Plex Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        <main
          role="alert"
          style={{
            maxWidth: '28rem',
            margin: '2rem 1rem',
            padding: '1.5rem',
            background: '#ffffff',
            border: '1px solid #ccdad8',
            borderRadius: 10,
          }}
        >
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 .5rem' }}>La app no pudo arrancar</h1>
          <p style={{ margin: '0 0 1rem', color: '#5c6b6a' }}>
            Falló algo antes de que hubiera pantalla. Tus datos están en el servidor y no se
            tocaron. Reintentar vuelve a montar la app; si insiste, salir a Mi Día pide la
            página de nuevo al servidor.
          </p>
          {error.digest && (
            <p style={{ margin: '0 0 1rem', color: '#5c6b6a', fontFamily: 'monospace', fontSize: '.8rem' }}>
              Referencia: {error.digest}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                font: 'inherit',
                minHeight: 44,
                padding: '.6rem 1rem',
                border: '1px solid #0a7c82',
                borderRadius: 8,
                background: '#0a7c82',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              Reintentar
            </button>
            <a
              href="/dia"
              style={{
                font: 'inherit',
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '.6rem 1rem',
                border: '1px solid #ccdad8',
                borderRadius: 8,
                background: '#ffffff',
                color: '#1a2323',
                textDecoration: 'none',
              }}
            >
              Ir a Mi Día
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
