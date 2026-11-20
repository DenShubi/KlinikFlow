// Checks row-level security against the real database: signs in as each role
// with the publishable key (exactly what the app does) and compares what each
// one can see and change with what the secret key sees.
//
//   npm run test:rls
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY, DEMO_STAFF_PASSWORD (run `npm run staff:seed` first).
// Makes no lasting changes: the write checks are expected to be refused.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type Table = keyof Database["public"]["Tables"];

const RECEPTIONIST = "resepsionis@klinikflow.test";
const DOCTOR_A = "dokter.a@klinikflow.test";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local (see .env.example).`);
    process.exit(1);
  }
  return value;
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const secretKey = requireEnv("SUPABASE_SECRET_KEY");
const password = requireEnv("DEMO_STAFF_PASSWORD");

const options = { auth: { autoRefreshToken: false, persistSession: false } };

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(58)} ${detail}`);
}

async function count(client: Client, table: Table): Promise<number> {
  const { count: n, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

async function countTicketsOf(client: Client, doctorId: string): Promise<number> {
  const { count: n, error } = await client
    .from("queue_tickets")
    .select("*", { count: "exact", head: true })
    .eq("doctor_id", doctorId);
  if (error) throw new Error(`queue_tickets: ${error.message}`);
  return n ?? 0;
}

async function signIn(email: string): Promise<Client> {
  const client = createClient<Database>(url, publishableKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  const admin = createClient<Database>(url, secretKey, options);
  const anon = createClient<Database>(url, publishableKey, options);
  const receptionist = await signIn(RECEPTIONIST);
  const doctorA = await signIn(DOCTOR_A);

  const { data: doctors, error } = await admin
    .from("doctors")
    .select("id, ticket_prefix, profile_id")
    .order("ticket_prefix");
  if (error) throw error;
  const docA = doctors.find((d) => d.ticket_prefix === "A");
  const docB = doctors.find((d) => d.ticket_prefix === "B");
  if (!docA?.profile_id || !docB) throw new Error("Doctor A is not linked; run npm run staff:seed.");

  const total = {
    tickets: await count(admin, "queue_tickets"),
    ticketsA: await countTicketsOf(admin, docA.id),
    patients: await count(admin, "patients"),
    events: await count(admin, "queue_events"),
    profiles: await count(admin, "profiles"),
  };
  const { data: patientsOfA } = await admin
    .from("queue_tickets")
    .select("patient_id")
    .eq("doctor_id", docA.id);
  const patientsA = new Set(patientsOfA?.map((r) => r.patient_id)).size;

  console.log("Anonymous (publishable key, not signed in)");
  for (const table of ["profiles", "doctors", "patients", "queue_tickets", "queue_events", "notifications"] as const) {
    const n = await count(anon, table);
    check(`  sees no ${table}`, n === 0, `${n} rows`);
  }

  console.log("\nReceptionist");
  let n = await count(receptionist, "queue_tickets");
  check("  sees every ticket", n === total.tickets, `${n} / ${total.tickets}`);
  n = await count(receptionist, "patients");
  check("  sees every patient", n === total.patients, `${n} / ${total.patients}`);
  n = await count(receptionist, "queue_events");
  check("  sees every queue event", n === total.events, `${n} / ${total.events}`);
  n = await count(receptionist, "profiles");
  check("  sees every staff profile", n === total.profiles, `${n} / ${total.profiles}`);
  n = await count(receptionist, "doctors");
  check("  sees all doctors", n === doctors.length, `${n} / ${doctors.length}`);

  console.log("\nDoctor A");
  n = await count(doctorA, "queue_tickets");
  check("  sees only own queue's tickets", n === total.ticketsA, `${n} (own: ${total.ticketsA}, all: ${total.tickets})`);
  n = await countTicketsOf(doctorA, docB.id);
  check("  sees none of doctor B's tickets", n === 0, `${n} rows`);
  n = await count(doctorA, "patients");
  check("  sees only patients in own queue", n === patientsA, `${n} (own: ${patientsA}, all: ${total.patients})`);
  n = await count(doctorA, "profiles");
  check("  sees only own profile", n === 1, `${n} rows`);
  n = await count(doctorA, "notifications");
  check("  sees no notifications", n === 0, `${n} rows`);

  console.log("\nWrites that must be refused");
  const { data: anyPatient } = await admin.from("patients").select("id").limit(1).single();
  const { error: insertError } = await doctorA.from("queue_tickets").insert({
    doctor_id: docA.id,
    patient_id: anyPatient!.id,
    ticket_number: 999,
    position: 999,
    channel: "walk_in",
    complaint: "RLS check, must be refused",
  });
  check("  doctor cannot add a ticket", !!insertError, insertError?.code ?? "inserted!");
  if (!insertError) {
    await admin.from("queue_tickets").delete().eq("ticket_number", 999).eq("position", 999);
  }

  const { data: updatedB } = await doctorA
    .from("queue_tickets")
    .update({ complaint: "RLS check, must be refused" })
    .eq("doctor_id", docB.id)
    .select("id");
  check("  doctor cannot edit doctor B's tickets", (updatedB?.length ?? 0) === 0, `${updatedB?.length ?? 0} rows changed`);

  const { error: roleError } = await doctorA
    .from("profiles")
    .update({ role: "receptionist" })
    .eq("id", docA.profile_id)
    .select("id");
  const { data: roleAfter } = await admin.from("profiles").select("role").eq("id", docA.profile_id).single();
  check("  doctor cannot change own role", roleAfter?.role === "doctor", roleError?.code ?? `role is ${roleAfter?.role}`);

  const { error: patientError } = await doctorA
    .from("patients")
    .insert({ full_name: "RLS check, must be refused" });
  check("  doctor cannot add a patient", !!patientError, patientError?.code ?? "inserted!");

  // Read the Auth settings instead of trying a real sign-up, which would send email.
  const settings = (await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: publishableKey },
  }).then((r) => r.json())) as { disable_signup?: boolean };
  check(
    "  public sign-up is disabled (Auth setting)",
    settings.disable_signup === true,
    `disable_signup = ${settings.disable_signup}`,
  );

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll RLS checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
