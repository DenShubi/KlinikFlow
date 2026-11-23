// Step-by-step demo of auto-defer: a patient who is at the clinic is called
// but does not come into the room. Each time they are moved back two turns
// ("Ditunda 1×", "Ditunda 2×"); the third time the ticket becomes "Tidak hadir".
//
//   npm run demo:absent -- reset    5 patients for doctor C, all in the waiting room
//   npm run demo:absent -- call     doctor finishes the current patient and calls the next
//   npm run demo:absent -- absent   the called patient does not come in: doctor presses "Tidak hadir"
//   npm run demo:absent -- show     print the queue
//
// Runs as the real demo accounts (receptionist and doctor C) through the same
// queue functions as the app, on a separate demo date (default 2099-01-04).
// Open the printed ticket link to watch Fajar's own page change live.
// In the app the same happens automatically after 5 minutes without "Mulai periksa".
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY, DEMO_STAFF_PASSWORD; optional NEXT_PUBLIC_APP_URL, DEMO_ABSENT_DATE.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const DATE = process.env.DEMO_ABSENT_DATE ?? "2099-01-04";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TAG = "DEMO";
const WATCHED = `${TAG} Fajar`;
const PATIENTS = [
  { name: `${TAG} Fajar`, phone: "+6280000009101", complaint: "Batuk berdahak" },
  { name: `${TAG} Gita`, phone: "+6280000009102", complaint: "Demam ringan" },
  { name: `${TAG} Hadi`, phone: "+6280000009103", complaint: "Nyeri punggung" },
  { name: `${TAG} Intan`, phone: "+6280000009104", complaint: "Gatal-gatal" },
  { name: `${TAG} Joko`, phone: "+6280000009105", complaint: "Kontrol tensi" },
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

async function doctorC(): Promise<string> {
  const { data } = await admin.from("doctors").select("id").eq("ticket_prefix", "C").single();
  if (!data) throw new Error("Doctor C not found; load the seed.");
  return data.id;
}

const STATUS: Record<string, string> = {
  waiting: "Menunggu",
  called: "DIPANGGIL",
  in_consultation: "Diperiksa",
  done: "Selesai",
  cancelled: "Batal",
  no_show: "TIDAK HADIR",
};

const code = (n: number) => `C-${String(n).padStart(3, "0")}`;

async function show(title: string) {
  const { data } = await admin
    .from("queue_tickets")
    .select("id, ticket_number, position, status, defer_count, patients!inner(full_name)")
    .eq("service_date", DATE)
    .like("patients.full_name", `${TAG} %`)
    .order("position");
  console.log(`\n=== ${title} ===`);
  console.log("Urutan  Tiket  Pasien       Status        Ditunda");
  for (const t of data ?? []) {
    console.log(
      `${String(t.position).padStart(6)}  ${code(t.ticket_number)}  ${t.patients.full_name.padEnd(11)}  ${STATUS[t.status].padEnd(12)}  ${t.defer_count ? `${t.defer_count}×` : ""}`,
    );
  }
  const watched = data?.find((t) => t.patients.full_name === WATCHED);
  if (watched) console.log(`\nTiket Fajar (halaman pasien): ${APP_URL}/ticket/${watched.id}`);
}

async function reset() {
  const receptionist = await signIn("resepsionis@klinikflow.test");
  const doctorId = await doctorC();
  await admin.from("queue_tickets").delete().eq("service_date", DATE);
  for (const p of PATIENTS) {
    let { data: patient } = await admin.from("patients").select("id").eq("phone", p.phone).maybeSingle();
    if (!patient) {
      ({ data: patient } = await admin.from("patients").insert({ full_name: p.name, phone: p.phone }).select("id").single());
    }
    const { data: ticket, error } = await receptionist.rpc("queue_create_ticket", {
      p_doctor_id: doctorId,
      p_patient_id: patient!.id,
      p_channel: "walk_in",
      p_complaint: p.complaint,
      p_predicted_minutes: 10,
      p_prediction_source: "fallback",
      p_service_date: DATE,
    });
    if (error) throw new Error(`create ${p.name}: ${error.message}`);
    await receptionist.rpc("queue_check_in", { p_ticket_id: ticket.id }); // all in the waiting room
  }
  await show("Langkah 1: lima pasien di ruang tunggu dokter C, semua sudah ditandai tiba");
}

async function call() {
  const doctor = await signIn("dokter.c@klinikflow.test");
  const doctorId = await doctorC();
  const { data: active } = await admin
    .from("queue_tickets")
    .select("id, status")
    .eq("service_date", DATE)
    .in("status", ["called", "in_consultation"]);
  for (const t of active ?? []) {
    // Whoever is with the doctor, or came in after being called, finishes first.
    if (t.status === "called") await doctor.rpc("queue_start_consultation", { p_ticket_id: t.id });
    await doctor.rpc("queue_finish_consultation", { p_ticket_id: t.id });
  }
  const { data: called, error } = await doctor.rpc("queue_call_next", { p_doctor_id: doctorId, p_service_date: DATE });
  console.log(error ? `Panggil berikutnya: ditolak (${error.message})` : `Dokter menekan "Panggil" -> ${code(called.ticket_number)} dipanggil`);
  await show("Setelah dokter memanggil");
}

async function absent() {
  const doctor = await signIn("dokter.c@klinikflow.test");
  const { data: called } = await admin
    .from("queue_tickets")
    .select("id, ticket_number, patients(full_name)")
    .eq("service_date", DATE)
    .eq("status", "called")
    .maybeSingle();
  if (!called) {
    console.log("Tidak ada pasien yang sedang dipanggil. Jalankan dulu: npm run demo:absent -- call");
    return;
  }
  const { data, error } = await doctor.rpc("queue_mark_absent", { p_ticket_id: called.id });
  if (error) throw new Error(`mark absent: ${error.message}`);
  console.log(
    `${code(called.ticket_number)} (${called.patients?.full_name}) tidak masuk; dokter menekan "Tidak hadir" -> ` +
      (data.status === "no_show" ? "TIDAK HADIR, keluar dari antrean" : `mundur 2 giliran (ditunda ${data.defer_count}×)`),
  );
  await show("Setelah pasien tidak masuk");
}

const step = process.argv[2];
const steps: Record<string, () => Promise<void>> = { reset, call, absent, show: () => show("Antrean demo") };
if (!steps[step]) {
  console.log("Usage: npm run demo:absent -- reset | call | absent | show");
  process.exit(1);
}
steps[step]().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
