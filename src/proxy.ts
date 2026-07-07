import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

const PUBLIC_ROUTES = ['/login']
const AUTH_ROUTE = '/login'

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.includes(path)

  const cookie = req.cookies.get('session')?.value
  const session = await decrypt(cookie)

  // El proxy corre en Edge (sin acceso a DB): solo valida la FIRMA del JWT como
  // guardia rápida contra rutas protegidas. La decisión "sesión válida → /dia"
  // vive en la página de login (verifySession, con DB) para evitar el loop
  // login↔dia con cookies de usuarios borrados.
  if (!isPublic && !session) {
    return NextResponse.redirect(new URL(AUTH_ROUTE, req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  // El manifest PWA, sus íconos y el service worker son metadata pública —
  // el navegador/SO los puede pedir sin sesión (instalación, prefetch de icono).
  // El portal cliente (/portal/[token]) tiene su PROPIA autorización por token
  // (ver getPortalData) — nunca debe exigir cookie de sesión ni redirigir a
  // Mau lejos de ahí si está logueado (quiere poder previsualizarlo).
  matcher: ['/((?!api|_next/static|_next/image|manifest.webmanifest|pwa/|sw.js|portal/|.*\\.png$|.*\\.ico$).*)'],
}
