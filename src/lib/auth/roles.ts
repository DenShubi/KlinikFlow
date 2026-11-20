import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

// Where each role lands after signing in.
export const ROLE_HOME: Record<AppRole, string> = {
  receptionist: "/reception",
  doctor: "/doctor",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  receptionist: "Resepsionis",
  doctor: "Dokter",
};

// Routes that need a signed-in staff member. The proxy sends anyone without a
// session to /login; the page itself then checks the role (src/lib/auth/dal.ts).
export const STAFF_ROUTE_PREFIXES = Object.values(ROLE_HOME);
