// Replaces today's queue with a fresh synthetic one, so the demo looks alive on
// any day (before a judge session, a video recording or a rehearsal).
//
//   npm run demo:refresh -- --yes
//
// Deletes ALL of today's tickets in the database that .env.local points to,
// then generates 12 synthetic tickets per doctor around the current time.
// Past days, patients and staff accounts are not touched. The database refuses
// if today's queue contains a patient with a real phone number (anything
// outside the synthetic +62 800 range), so it cannot wipe clinic-trial data.
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.");
  process.exit(1);
}

if (!process.argv.includes("--yes")) {
  console.log(`This replaces TODAY's queue in ${url} with synthetic patients.`);
  console.log("Run again with --yes to continue:  npm run demo:refresh -- --yes");
  process.exit(1);
}

const admin = createClient<Database>(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.rpc("demo_refresh_today");
if (error) {
  console.error(
    error.message === "real_patients_today"
      ? "Refused: today's queue has patients with real phone numbers. Nothing was changed."
      : `Failed: ${error.message}`,
  );
  process.exit(1);
}

const result = data as { service_date: string; removed: number; created: number };
console.log(`Today's queue (${result.service_date}) refreshed: ${result.removed} tickets removed, ${result.created} created.`);
