// Creates (or updates) the demo staff accounts and links each doctor login to
// its row in public.doctors. Safe to run again: existing accounts get the
// current password and role.
//
//   npm run staff:seed
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// DEMO_STAFF_PASSWORD. Run it after the database seed, since doctors must exist.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

type StaffAccount = {
  email: string;
  fullName: string;
  role: Database["public"]["Enums"]["app_role"];
  doctorPrefix?: string; // ticket_prefix of the doctor this login belongs to
};

// All names are invented. The .test domain cannot receive email.
const STAFF_ACCOUNTS: StaffAccount[] = [
  { email: "resepsionis@klinikflow.test", fullName: "Rina Andriani", role: "receptionist" },
  { email: "dokter.a@klinikflow.test", fullName: "dr. Larasati Wibowo", role: "doctor", doctorPrefix: "A" },
  { email: "dokter.b@klinikflow.test", fullName: "dr. Hendra Kusuma", role: "doctor", doctorPrefix: "B" },
  { email: "dokter.c@klinikflow.test", fullName: "dr. Maya Sitompul", role: "doctor", doctorPrefix: "C" },
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const password = requireEnv("DEMO_STAFF_PASSWORD");
  if (password.length < 10) {
    console.error("DEMO_STAFF_PASSWORD must be at least 10 characters.");
    process.exit(1);
  }

  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existingByEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

  for (const account of STAFF_ACCOUNTS) {
    const existing = existingByEmail.get(account.email);
    let userId: string;

    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      userId = existing.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      userId = data.user.id;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: userId, full_name: account.fullName, role: account.role });
    if (profileError) throw profileError;

    if (account.doctorPrefix) {
      // Unlink any other doctor row from this login first (profile_id is unique).
      const { error: unlinkError } = await admin
        .from("doctors")
        .update({ profile_id: null })
        .eq("profile_id", userId)
        .neq("ticket_prefix", account.doctorPrefix);
      if (unlinkError) throw unlinkError;

      const { data: linked, error: linkError } = await admin
        .from("doctors")
        .update({ profile_id: userId })
        .eq("ticket_prefix", account.doctorPrefix)
        .select("id");
      if (linkError) throw linkError;
      if (!linked?.length) {
        throw new Error(
          `No doctor with ticket_prefix ${account.doctorPrefix}. Load the database seed first.`,
        );
      }
    }

    console.log(`${existing ? "updated" : "created"}  ${account.role.padEnd(12)} ${account.email}`);
  }

  console.log("\nAll staff accounts use the password in DEMO_STAFF_PASSWORD (.env.local).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
