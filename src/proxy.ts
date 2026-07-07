import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

const PUBLIC_ROUTES = ['/login']
const AUTH_ROUTE = '/login'
const DEFAULT_ROUTE = '/dia'

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const isPublic = PUBLIC_ROUTES.includes(path)

  const cookie = req.cookies.get('session')?.value
  const session = await decrypt(cookie)

  if (!isPublic && !session) {
    return NextResponse.redirect(new URL(AUTH_ROUTE, req.nextUrl))
  }

  if (isPublic && session) {
    return NextResponse.redirect(new URL(DEFAULT_ROUTE, req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  // El manifest PWA, sus íconos y el service worker son metadata pública —
  // el navegador/SO los puede pedir sin sesión (instalación, prefetch de icono).
  matcher: ['/((?!api|_next/static|_next/image|manifest.webmanifest|pwa/|sw.js|.*\\.png$|.*\\.ico$).*)'],
}
