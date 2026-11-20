import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { STAFF_ROUTE_PREFIXES } from "@/lib/auth/roles";
import { getSupabasePublicEnv } from "@/lib/env";

function isStaffRoute(pathname: string): boolean {
  return STAFF_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Refreshes the Supabase auth session on every matched request and writes the
// updated cookies to the response. Visitors without a session who open a staff
// page are sent to /login. This is only a fast first check: each staff page
// verifies the role itself (src/lib/auth/dal.ts) and RLS guards the data.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabasePublicEnv();
  if (!env) {
    // Not configured yet: let the page render and explain what is missing.
    return response;
  }

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims: it validates the
  // JWT and triggers the token refresh that setAll writes back.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && isStaffRoute(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // Keep any cookie changes (e.g. a cleared expired session) on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie" && key !== "location") redirect.headers.set(key, value);
    });
    return redirect;
  }

  return response;
}
