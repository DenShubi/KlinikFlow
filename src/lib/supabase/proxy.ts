import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env";

// Refreshes the Supabase auth session on every matched request and writes the
// updated cookies to the response. Route protection (receptionist vs doctor)
// is added here in the auth task.
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
  await supabase.auth.getClaims();

  return response;
}
