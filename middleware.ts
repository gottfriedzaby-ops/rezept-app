import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";

const intlMiddleware = createIntlMiddleware(routing);

function getLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      return locale;
    }
  }
  return routing.defaultLocale;
}

function stripLocale(pathname: string, locale: string): string {
  if (pathname === `/${locale}`) return '/';
  if (pathname.startsWith(`/${locale}/`)) return pathname.slice(`/${locale}`.length);
  return pathname;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  type CookieEntry = { name: string; value: string; options: Record<string, unknown> };
  const pendingCookies: CookieEntry[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach((c) => pendingCookies.push(c as CookieEntry));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  function applySupabaseCookies(res: NextResponse): NextResponse {
    pendingCookies.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2]);
    });
    return res;
  }

  // API routes: auth gate only, no locale routing
  if (pathname.startsWith('/api/')) {
    // Gate /api/admin/* — admins only. Returns JSON 403, not a redirect, so
    // fetch() callers see a clean error. Service-role queries inside the route
    // bypass RLS, so this middleware gate is the only authorisation barrier.
    if (pathname.startsWith("/api/admin")) {
      if (!user || !isAdmin(user)) {
        return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
      }
    }
    return applySupabaseCookies(NextResponse.next({ request }));
  }

  // Auth routes (Supabase callbacks): skip locale routing
  if (pathname.startsWith('/auth/')) {
    return applySupabaseCookies(NextResponse.next({ request }));
  }

  // For page routes: auth checks with locale-aware paths
  const locale = getLocale(pathname);
  const strippedPath = stripLocale(pathname, locale);

  const isPublic =
    strippedPath.startsWith("/login") ||
    strippedPath.startsWith("/register") ||
    strippedPath.startsWith("/auth") ||
    strippedPath.startsWith("/shared");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.searchParams.delete('redirect');
    if (strippedPath !== '/') {
      url.searchParams.set("redirect", strippedPath);
    }
    return applySupabaseCookies(NextResponse.redirect(url));
  }

  // Redirect logged-in users away from auth pages
  if (user && (strippedPath === '/login' || strippedPath === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    return applySupabaseCookies(NextResponse.redirect(url));
  }

  // Locale routing for all page routes
  return applySupabaseCookies(intlMiddleware(request));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
