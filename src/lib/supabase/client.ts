import { createBrowserClient } from "@supabase/ssr";

import { requireSupabasePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Supabase client for Client Components (browser). Uses the publishable key only;
// row-level security decides what each signed-in user can read.
export function createClient() {
  const { url, publishableKey } = requireSupabasePublicEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
