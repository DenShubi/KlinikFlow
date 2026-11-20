// End-to-end check of the queue engine against the real database, signed in
// as real staff accounts: ticket numbering, wait estimates, call next, start,
// finish (actual duration saved), skipping patients who have not arrived,
// permissions, and Realtime delivery per role.
//
//   npm run test:queue
//
// Works on a far-future test date (2099-01-01) so today's demo queue is not
// touched (plus 2099-01-02 for the hybrid synchronizer), and deletes
// everything it created at the end.
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY, DEMO_STAFF_PASSWORD (run `npm run staff:seed` first).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const TEST_DATE = "2099-01-01";
const SYNC_DATE = "2099-01-02";
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
  await admin.from("queue_tickets").delete().in("service_date", [TEST_DATE, SYNC_DATE]);
  await admin.from("patients").delete().like("full_name", `${TEST_TAG}%`);

  const { data: patients, error: patientError } = await receptionist
    .from("patients")
    .insert([1, 2, 3].map((n) => ({ full_name: `${TEST_TAG} Pasien ${n}` })))
    .select("id");
  if (patientError || !patients) throw patientError;

  const recLive = await listen(receptionist, "receptionist");
  const docBLive = await listen(doctorB, "doctor-b");

  // A patient's phone: not signed in, listens to the public broadcast for the queue.
  const patient = createClient<Database>(url, publishableKey, options);
  const patientEvents: unknown[] = [];
  const patientChannel = patient
    .channel(`queue:${docA}:${TEST_DATE}`)
    .on("broadcast", { event: "queue_changed" }, (msg) => patientEvents.push(msg));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Broadcast subscribe timed out")), 15000);
    patientChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
    });
  });

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

    console.log("\nPatient view (not signed in)");
    const { data: raw, error: statusError } = await patient.rpc("ticket_public_status", { p_ticket_id: t3.data!.id });
    const status = raw as Record<string, unknown> | null;
    check("patient reads own ticket by id", status?.ticket_code === "A-003" && status.status === "called", statusError?.message);
    check(
      "status has no phone, complaint or full name",
      !!status && !("phone" in status) && !("complaint" in status) && !String(status.patient_short_name).includes("Pasien 3"),
      String(status?.patient_short_name),
    );
    const { count: anonRows } = await patient.from("queue_tickets").select("*", { count: "exact", head: true });
    check("patient still cannot read the tickets table", (anonRows ?? 0) === 0, `${anonRows ?? 0} rows`);
    check("patient received live broadcasts for the queue", patientEvents.length > 0, `${patientEvents.length} messages`);
    const leaked = JSON.stringify(patientEvents).includes(TEST_TAG);
    check("broadcasts carry no patient data", !leaked);

    console.log("\nHybrid synchronizer (walk-in and remote in one queue)");
    const mk = (i: number, channel: "walk_in" | "remote") =>
      receptionist.rpc("queue_create_ticket", {
        p_doctor_id: docA,
        p_patient_id: patients[i % 3].id,
        p_channel: channel,
        p_complaint: `${TEST_TAG} Kontrol`,
        p_predicted_minutes: 10,
        p_prediction_source: "fallback",
        p_service_date: SYNC_DATE,
      });
    const h1 = await mk(0, "walk_in");
    const h2 = await mk(1, "remote");
    await mk(2, "walk_in");
    await mk(0, "walk_in");
    const order = async () => {
      const { data } = await admin
        .from("queue_tickets")
        .select("ticket_number")
        .eq("service_date", SYNC_DATE)
        .in("status", ["waiting", "called"])
        .order("position");
      return JSON.stringify(data?.map((t) => t.ticket_number));
    };
    await doctorA.rpc("queue_call_next", { p_doctor_id: docA, p_service_date: SYNC_DATE });
    await doctorA.rpc("queue_start_consultation", { p_ticket_id: h1.data!.id });
    await doctorA.rpc("queue_finish_consultation", { p_ticket_id: h1.data!.id });
    const next = await doctorA.rpc("queue_call_next", { p_doctor_id: docA, p_service_date: SYNC_DATE });
    check("absent remote #2 is passed; walk-in #3 is called", next.data?.ticket_number === 3, next.error?.message);
    const { data: missedRaw } = await patient.rpc("ticket_public_status", { p_ticket_id: h2.data!.id });
    const missed = missedRaw as { missed_turn?: boolean; estimated_call_at?: string | null } | null;
    check("remote #2 sees 'missed turn' and has no estimate", missed?.missed_turn === true && missed.estimated_call_at === null);
    const late = await receptionist.rpc("queue_check_in", { p_ticket_id: h2.data!.id });
    check("late #2 checks in", !!late.data?.checked_in_at, late.error?.message);
    const after = await order();
    check("#2 rejoins behind the patients present (#3 called, #4, then #2)", after === "[3,4,2]", after);
    const direct = await receptionist.from("queue_tickets").update({ position: 1 }).eq("id", h2.data!.id).select("id");
    check("tickets can no longer be edited outside the queue functions", !!direct.error, direct.error?.code);
  } finally {
    await patient.removeChannel(patientChannel);
    await recLive.close();
    await docBLive.close();
    await admin.from("queue_tickets").delete().in("service_date", [TEST_DATE, SYNC_DATE]);
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
