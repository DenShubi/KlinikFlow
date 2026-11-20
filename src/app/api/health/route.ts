import { connection } from "next/server";

import { checkSupabaseHealth } from "@/lib/supabase/health";

// GET /api/health — reports whether the app reaches Supabase.
export async function GET() {
  await connection(); // always run at request time, never prerendered
  const supabase = await checkSupabaseHealth();
  const httpStatus = supabase.status === "ok" ? 200 : 503;
  return Response.json({ app: "ok", supabase }, { status: httpStatus });
}
