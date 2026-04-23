import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from './config/routes';

const DASHBOARD_PREFIX = '/dashboard';
const ADMIN_PREFIX = '/admin';

function isDashboardRoute(pathname: string) {
  return pathname === DASHBOARD_PREFIX || pathname.startsWith(`${DASHBOARD_PREFIX}/`);
}

function isAdminRoute(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function applyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, cookie);
  });
}

function buildRedirectResponse(
  request: NextRequest,
  pathname: string,
  sourceResponse: NextResponse
) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.search = '';
  const redirectResponse = NextResponse.redirect(redirectUrl);
  applyResponseCookies(sourceResponse, redirectResponse);
  return redirectResponse;
}

function buildLoginRedirect(request: NextRequest, sourceResponse: NextResponse) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = ROUTES.LOGIN;
  redirectUrl.search = '';
  redirectUrl.searchParams.set(
    'next',
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  const redirectResponse = NextResponse.redirect(redirectUrl);
  applyResponseCookies(sourceResponse, redirectResponse);
  return redirectResponse;
}

function resolveProtectedRedirect(pathname: string, isAdmin: boolean) {
  if (isAdmin) {
    return pathname.startsWith(`${DASHBOARD_PREFIX}/messages`)
      ? ROUTES.ADMIN_MESSAGES
      : ROUTES.ADMIN;
  }

  return pathname.startsWith(`${ADMIN_PREFIX}/messages`)
    ? ROUTES.MESSAGES
    : ROUTES.DASHBOARD;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = isDashboardRoute(pathname) || isAdminRoute(pathname);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isProtectedRoute) {
    return supabaseResponse;
  }

  if (!user) {
    return buildLoginRedirect(request, supabaseResponse);
  }

  let role =
    typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null;

  if (!role) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    role = profile?.role ?? null;
  }

  const isAdmin = role === 'admin';

  if (isDashboardRoute(pathname) && isAdmin) {
    return buildRedirectResponse(
      request,
      resolveProtectedRedirect(pathname, true),
      supabaseResponse
    );
  }

  if (isAdminRoute(pathname) && !isAdmin) {
    return buildRedirectResponse(
      request,
      resolveProtectedRedirect(pathname, false),
      supabaseResponse
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
