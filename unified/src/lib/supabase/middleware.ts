import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — important for Server Components
  const { data: { user } } = await supabase.auth.getUser()

  // Protect dashboard routes
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/overview') ||
    request.nextUrl.pathname.startsWith('/members') ||
    request.nextUrl.pathname.startsWith('/leads') ||
    request.nextUrl.pathname.startsWith('/retention') ||
    request.nextUrl.pathname.startsWith('/cancel-save') ||
    request.nextUrl.pathname.startsWith('/conversations') ||
    request.nextUrl.pathname.startsWith('/settings')

  if (isDashboardRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth/')
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/overview'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
