// End-to-end check of the queue engine against the real database, signed in
// as real staff accounts: ticket numbering, wait estimates, call next, start,
// finish (actual duration saved), skipping patients who have not arrived,
// permissions, and Realtime delivery per role.
//
//   npm run test:queue
//
// Works on a far-future test date (2099-01-01) so today's demo queue is not
// touched, and deletes everything it created at the end.
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY, DEMO_STAFF_PASSWORD (run `npm run staff:seed` first).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const TEST_DATE = "2099-01-01";
const TEST_TAG = "[test:queue]";

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
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(60)} ${detail}`);
}

async function signIn(email: string): Promise<Client> {
  const client = createClient<Database>(url, publishableKey, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  client.realtime.setAuth(data.session.access_token);
  return client;
}

// Collects Realtime changes to queue_tickets on the test date.
async function listen(client: Client, name: string) {
  const events: { ticket_number?: number; status?: string }[] = [];
  const channel = client
    .channel(`check-queue-${name}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "queue_tickets", filter: `service_date=eq.${TEST_DATE}` },
      (payload) => events.push(payload.new as { ticket_number?: number; status?: string }),
    );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime subscribe timed out (${name})`)), 15000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { events, close: () => client.removeChannel(channel) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const admin = createClient<Database>(url, secretKey, options);
  const receptionist = await signIn("resepsionis@klinikflow.test");
  const doctorA = await signIn("dokter.a@klinikflow.test");
  const doctorB = await signIn("dokter.b@klinikflow.test");

  const { data: doctors } = await admin.from("doctors").select("id, ticket_prefix").order("ticket_prefix");
  const docA = doctors?.find((d) => d.ticket_prefix === "A")?.id;
  if (!docA) throw new Error("Doctor A not found; load the seed.");

  // Clean leftovers from an interrupted earlier run.
  await admin.from("queue_tickets").delete().eq("service_date", TEST_DATE);
  await admin.from("patients").delete().like("full_name", `${TEST_TAG}%`);

  const { data: patients, error: patientError } = await receptionist
    .from("patients")
    .insert([1, 2, 3].map((n) => ({ full_name: `${TEST_TAG} Pasien ${n}` })))
    .select("id");
  if (patientError || !patients) throw patientError;

  const recLive = await listen(receptionist, "receptionist");
  const docBLive = await listen(doctorB, "doctor-b");

  try {
    console.log("Tickets and wait estimates");
    const create = (client: Client, i: number, channel: "walk_in" | "remote", minutes: number) =>
      client.rpc("queue_create_ticket", {
        p_doctor_id: docA,
        p_patient_id: patients[i].id,
        p_channel: channel,
        p_complaint: `${TEST_TAG} Batuk pilek`,
        p_predicted_minutes: minutes,
        p_prediction_source: "fallback",
        p_service_date: TEST_DATE,
      });

    const t1 = await create(receptionist, 0, "walk_in", 10);
    check("receptionist creates ticket #1 (walk-in)", t1.data?.ticket_number === 1, t1.error?.message);
    const t2 = await create(receptionist, 1, "remote", 8);
    check("receptionist creates ticket #2 (remote, not arrived)", t2.data?.ticket_number === 2 && !t2.data.checked_in_at, t2.error?.message);
    const t3 = await create(receptionist, 2, "walk_in", 12);
    check("receptionist creates ticket #3 at position 3", t3.data?.position === 3, t3.error?.message);
    const denied = await create(doctorA, 2, "walk_in", 5);
    check("doctor cannot create a ticket", !!denied.error, denied.error?.code);

    const { data: etas } = await admin
      .from("queue_tickets")
      .select("ticket_number, estimated_call_at")
      .eq("service_date", TEST_DATE)
      .order("position");
    const minutes = etas?.map((t) => Math.round((Date.parse(t.estimated_call_at!) - Date.now()) / 60000));
    check("wait estimates add up (0, 10, 18 min)", JSON.stringify(minutes) === "[0,10,18]", JSON.stringify(minutes));

    console.log("\nCall next, start, finish");
    const wrong = await doctorB.rpc("queue_call_next", { p_doctor_id: docA, p_service_date: TEST_DATE });
    check("doctor B cannot call next in doctor A's queue", wrong.error?.message === "not_allowed", wrong.error?.message);
    const c1 = await doctorA.rpc("queue_call_next", { p_doctor_id: docA, p_service_date: TEST_DATE });
    check("doctor A calls next -> #1", c1.data?.ticket_number === 1 && c1.data.status === "called", c1.error?.message);
    const again = await doctorA.rpc("queue_call_next", { p_doctor_id: docA, p_service_date: TEST_DATE });
    check("calling again is refused (patient_already_called)", again.error?.message === "patient_already_called", again.error?.message);
    const s1 = await doctorA.rpc("queue_start_consultation", { p_ticket_id: t1.data!.id });
    check("start consultation #1", s1.data?.status === "in_consultation", s1.error?.message);
    await sleep(1500);
    const f1 = await doctorA.rpc("queue_finish_consultation", { p_ticket_id: t1.data!.id });
    check(
      "finish #1 -> done with actual_minutes saved",
      f1.data?.status === "done" && typeof f1.data.actual_minutes === "number" && f1.data.actual_minutes > 0,
      `actual_minutes = ${f1.data?.actual_minutes}`,
    );
    const c3 = await doctorA.rpc("queue_call_next", { p_doctor_id: docA, p_service_date: TEST_DATE });
    check("call next skips remote #2 (not arrived) -> #3", c3.data?.ticket_number === 3, c3.error?.message);
    const in2 = await receptionist.rpc("queue_check_in", { p_ticket_id: t2.data!.id });
    check("receptionist checks in remote #2", !!in2.data?.checked_in_at, in2.error?.message);
    const x2 = await receptionist.rpc("queue_cancel_ticket", { p_ticket_id: t2.data!.id });
    check("receptionist cancels #2", x2.data?.status === "cancelled", x2.error?.message);

    console.log("\nRealtime");
    await sleep(3000); // let Realtime deliver
    const statuses = recLive.events.map((e) => `#${e.ticket_number}:${e.status}`);
    check("receptionist received the changes live", recLive.events.length >= 5, `${recLive.events.length} events`);
    check("  including #1 called and #1 done", statuses.includes("#1:called") && statuses.includes("#1:done"));
    check("doctor B received nothing from doctor A's queue (RLS)", docBLive.events.length === 0, `${docBLive.events.length} events`);
  } finally {
    await recLive.close();
    await docBLive.close();
    await admin.from("queue_tickets").delete().eq("service_date", TEST_DATE);
    await admin.from("patients").delete().like("full_name", `${TEST_TAG}%`);
    console.log("\nTest data removed.");
  }

  console.log(failures ? `${failures} check(s) failed.` : "All queue checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
