import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const publicPaths = ['/login', '/register']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get('ledger_session')

  // 公开页面不需要认证
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (session) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // API 路由不需要重定向
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // 需要认证但无会话 → 重定向到登录
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
}
