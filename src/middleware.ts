import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'pc_session'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isLoggedIn = req.cookies.get(SESSION_COOKIE)?.value === 'ok'

  const isPublicRoute = pathname === '/login' || pathname.startsWith('/api/login')
  const isLogoutRoute = pathname.startsWith('/api/logout')
  const isPublicAsset =
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/public')

  if (isPublicRoute || isLogoutRoute || isPublicAsset) return NextResponse.next()

  if (isLoggedIn) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const loginUrl = new URL('/login', req.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
