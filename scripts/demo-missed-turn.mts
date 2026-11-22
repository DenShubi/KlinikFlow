// Step-by-step demo of the hybrid synchronizer: a remote patient who is not
// at the clinic when their turn comes misses it, and rejoins two places behind
// the patients present when they finally arrive.
//
//   npm run demo:missed-turn -- reset    build the demo queue (5 patients, doctor B)
//   npm run demo:missed-turn -- next     doctor finishes the current patient and calls the next
//   npm run demo:missed-turn -- arrive   the late remote patient (Budi) arrives; receptionist checks him in
//   npm run demo:missed-turn -- show     print the queue
//
// Runs as the real demo staff accounts (receptionist and doctor B), through
// the same queue functions as the app, on a separate demo date (default
// 2099-01-03) so today's queue and the calibration data are not touched.
// Open the printed ticket link to watch Budi's own page change live.
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY, DEMO_STAFF_PASSWORD; optional NEXT_PUBLIC_APP_URL, DEMO_DATE.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const DATE = process.env.DEMO_DATE ?? "2099-01-03";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TAG = "DEMO";
const PATIENTS = [
  { name: `${TAG} Ani`, phone: "+6280000009001", channel: "walk_in" as const, complaint: "Batuk pilek ringan" },
  { name: `${TAG} Budi`, phone: "+6280000009002", channel: "remote" as const, complaint: "Kontrol tekanan darah" },
  { name: `${TAG} Citra`, phone: "+6280000009003", channel: "walk_in" as const, complaint: "Sakit tenggorokan" },
  { name: `${TAG} Dodi`, phone: "+6280000009004", channel: "walk_in" as const, complaint: "Gatal di lengan" },
  { name: `${TAG} Eka`, phone: "+6280000009005", channel: "walk_in" as const, complaint: "Sakit kepala" },
];

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name} in .env.local.`);
    process.exit(1);
  }
  return v;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient<Database>(url, env("SUPABASE_SECRET_KEY"), options);

async function signIn(email: string): Promise<Client> {
  const c = createClient<Database>(url, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), options);
  const { error } = await c.auth.signInWithPassword({ email, password: env("DEMO_STAFF_PASSWORD") });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return c;
}

async function doctorB(): Promise<string> {
  const { data } = await admin.from("doctors").select("id").eq("ticket_prefix", "B").single();
  if (!data) throw new Error("Doctor B not found; load the seed.");
  return data.id;
}

const STATUS: Record<string, string> = {
  waiting: "Menunggu",
  called: "DIPANGGIL",
  in_consultation: "Diperiksa",
  done: "Selesai",
  cancelled: "Batal",
  no_show: "Tidak hadir",
};

async function show(title: string) {
  const { data } = await admin
    .from("queue_tickets")
    .select("id, ticket_number, position, channel, status, checked_in_at, missed_turn_at, estimated_call_at, patients!inner(full_name)")
    .eq("service_date", DATE)
    .like("patients.full_name", `${TAG} %`)
    .order("position");
  const now = Date.now();
  console.log(`\n=== ${title} ===`);
  console.log("Urutan  Tiket  Pasien        Jalur     Status      Di klinik?  Catatan");
  for (const t of data ?? []) {
    const here = t.checked_in_at ? "ya" : "BELUM";
    const eta = t.estimated_call_at ? `dipanggil ±${Math.max(0, Math.round((Date.parse(t.estimated_call_at) - now) / 60000))} mnt lagi` : "";
    const note = t.missed_turn_at && !t.checked_in_at ? "GILIRAN TERLEWAT, tidak dihitung dalam antrean" : t.status === "waiting" ? eta : "";
    console.log(
      `${String(t.position).padStart(6)}  B-${String(t.ticket_number).padStart(3, "0")}  ${t.patients.full_name.padEnd(12)}  ${(t.channel === "remote" ? "online" : "langsung").padEnd(8)}  ${STATUS[t.status].padEnd(10)}  ${here.padEnd(10)}  ${note}`,
    );
  }
  const budi = data?.find((t) => t.patients.full_name === `${TAG} Budi`);
  if (budi) {
    const { data: s } = await admin.rpc("ticket_public_status", { p_ticket_id: budi.id });
    const st = s as { missed_turn: boolean; people_ahead: number; status: string } | null;
    console.log(`\nTiket Budi (halaman pasien): ${APP_URL}/ticket/${budi.id}`);
    console.log(`  status=${st?.status}, terlewat=${st?.missed_turn}, orang di depan=${st?.people_ahead}`);
  }
}

async function reset() {
  const receptionist = await signIn("resepsionis@klinikflow.test");
  const doctorId = await doctorB();
  await admin.from("queue_tickets").delete().eq("service_date", DATE);

  for (const p of PATIENTS) {
    let { data: patient } = await admin.from("patients").select("id").eq("phone", p.phone).maybeSingle();
    if (!patient) {
      ({ data: patient } = await admin.from("patients").insert({ full_name: p.name, phone: p.phone }).select("id").single());
    }
    const { data: ticket, error } = await receptionist.rpc("queue_create_ticket", {
      p_doctor_id: doctorId,
      p_patient_id: patient!.id,
      p_channel: p.channel,
      p_complaint: p.complaint,
      p_predicted_minutes: 10,
      p_prediction_source: "fallback",
      p_service_date: DATE,
    });
    if (error) throw new Error(`create ${p.name}: ${error.message}`);
    // Everyone except the remote patient is in the waiting room: the receptionist marks them as arrived.
    if (p.channel === "walk_in") await receptionist.rpc("queue_check_in", { p_ticket_id: ticket.id });
  }
  await show("Langkah 1: antrean dokter B. Budi daftar online dan masih di rumah");
}

async function next() {
  const doctor = await signIn("dokter.b@klinikflow.test");
  const doctorId = await doctorB();
  const { data: active } = await admin
    .from("queue_tickets")
    .select("id, status")
    .eq("service_date", DATE)
    .in("status", ["called", "in_consultation"]);
  for (const t of active ?? []) {
    if (t.status === "called") await doctor.rpc("queue_start_consultation", { p_ticket_id: t.id });
    const { error } = await doctor.rpc("queue_finish_consultation", { p_ticket_id: t.id });
    if (error) throw new Error(`finish: ${error.message}`);
  }
  const { data: called, error } = await doctor.rpc("queue_call_next", { p_doctor_id: doctorId, p_service_date: DATE });
  if (error) {
    console.log(`Dokter memanggil berikutnya: ditolak (${error.message})`);
  } else {
    console.log(`Dokter menekan "Panggil berikutnya" -> B-${String(called.ticket_number).padStart(3, "0")} dipanggil`);
  }
  await show("Setelah dokter memanggil pasien berikutnya");
}

async function arrive() {
  const receptionist = await signIn("resepsionis@klinikflow.test");
  const { data: budi } = await admin
    .from("queue_tickets")
    .select("id, patients!inner(full_name)")
    .eq("service_date", DATE)
    .eq("patients.full_name", `${TAG} Budi`)
    .single();
  if (!budi) throw new Error("Run reset first.");
  const { error } = await receptionist.rpc("queue_check_in", { p_ticket_id: budi.id });
  if (error) throw new Error(`check-in: ${error.message}`);
  console.log('Budi tiba di klinik; resepsionis menekan "Tiba"');
  await show("Budi masuk lagi: 2 posisi di belakang pasien yang sudah hadir");
}

const step = process.argv[2];
const steps: Record<string, () => Promise<void>> = { reset, next, arrive, show: () => show("Antrean demo") };
if (!steps[step]) {
  console.log("Usage: npm run demo:missed-turn -- reset | next | arrive | show");
  process.exit(1);
}
steps[step]().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
