import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";

// The queue functions in the database raise short machine-readable messages
// (see supabase/migrations/*_queue_engine.sql). This turns them into text
// for staff, in their language (src/lib/i18n/dictionaries, staff.errors).
export function queueErrorMessage(error: { message?: string; code?: string } | null | undefined, locale: Locale = "id"): string {
  const messages = DICTIONARIES[locale].staff.errors;
  if (!error) return messages.generic;
  if (error.message && error.message !== "generic" && error.message !== "retry" && messages[error.message]) {
    return messages[error.message];
  }
  // Row-level security refused the change.
  if (error.code === "42501") return messages.not_allowed;
  return messages.retry;
}
