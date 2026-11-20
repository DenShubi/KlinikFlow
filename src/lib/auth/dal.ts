import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { ROLE_HOME, type AppRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type Staff = {
  userId: string;
  email: string | null;
  fullName: string;
  role: AppRole;
  // doctors.id for a doctor login; null for receptionists or an unlinked doctor.
  doctorId: string | null;
};

// The signed-in staff member, or null. Verifies the session JWT and reads the
// role from public.profiles (which only server code can write). Cached per request.
export const getStaff = cache(async (): Promise<Staff | null> => {
  // Session checks compare token expiry with the clock, so they must run per
  // request, never while Next.js prerenders.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const userId = data.claims.sub;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  let doctorId: string | null = null;
  if (profile.role === "doctor") {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    doctorId = doctor?.id ?? null;
  }

  return {
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    fullName: profile.full_name,
    role: profile.role,
    doctorId,
  };
});

// Use at the top of every staff page and Server Action. Sends visitors without
// a staff session to /login, and staff with another role to their own home.
// Row-level security enforces the same rules in the database.
export async function requireStaff(role: AppRole): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.role !== role) redirect(ROLE_HOME[staff.role]);
  return staff;
}
