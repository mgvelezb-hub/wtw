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
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$).*)'],
}
