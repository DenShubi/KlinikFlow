// Central place for environment variables. Every name here is listed in .env.example.
//
// NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so they
// must be referenced literally (process.env.NEXT_PUBLIC_X), never through a dynamic key.

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function requireSupabasePublicEnv() {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return env;
}
