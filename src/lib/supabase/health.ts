import "server-only";

import { getSupabasePublicEnv } from "@/lib/env";

export type SupabaseHealth =
  | { status: "ok"; url: string; authVersion: string | null; latencyMs: number }
  | { status: "not_configured" }
  | { status: "error"; url: string; message: string };

// Checks that the app can reach the Supabase project with the configured key.
// Uses the Auth health endpoint, so it works before any table exists.
export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  const env = getSupabasePublicEnv();
  if (!env) return { status: "not_configured" };

  const started = Date.now();
  try {
    const res = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { status: "error", url: env.url, message: `HTTP ${res.status} from Supabase Auth` };
    }
    const body = (await res.json().catch(() => ({}))) as { version?: string };
    return {
      status: "ok",
      url: env.url,
      authVersion: body.version ?? null,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      status: "error",
      url: env.url,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
