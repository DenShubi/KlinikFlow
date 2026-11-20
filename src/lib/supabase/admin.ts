import "server-only";

import { createClient } from "@supabase/supabase-js";

import { requireSupabasePublicEnv, requireSupabaseSecretKey } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Supabase client with the secret key: bypasses row-level security. Use only in
// server code that acts for someone who is not signed in (the patient intake)
// or for trusted jobs (webhooks), and only with narrow, explicit queries.
export function createAdminClient() {
  const { url } = requireSupabasePublicEnv();
  return createClient<Database>(url, requireSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
