import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { clinicToday, minutesUntil } from "@/lib/clinic-time";
import { createAdminClient } from "@/lib/supabase/admin";

import { IntakeForm, type DoctorOption } from "./intake-form";

export const metadata: Metadata = {
  title: "Ambil antrean · KlinikFlow",
  description: "Daftar antrean klinik dari rumah dan pantau giliran Anda.",
};

export default async function IntakePage() {
  await connection(); // queue lengths are read per request
  const admin = createAdminClient();
  const today = clinicToday();

  const [{ data: doctors }, { data: active }] = await Promise.all([
    admin.from("doctors").select("id, full_name, room, ticket_prefix").eq("is_active", true).order("ticket_prefix"),
    admin
      .from("queue_tickets")
      .select("doctor_id, status, estimated_call_at, predicted_minutes")
      .eq("service_date", today)
      .in("status", ["waiting", "called", "in_consultation"]),
  ]);

  // Rough wait for someone joining now: when the last waiting patient is
  // expected to be called, plus their consultation.
  const options: DoctorOption[] = (doctors ?? []).map((d) => {
    const queue = active?.filter((t) => t.doctor_id === d.id) ?? [];
    const waiting = queue.filter((t) => t.status === "waiting");
    const lastEnd = waiting
      .map((t) => (t.estimated_call_at ? Date.parse(t.estimated_call_at) + (t.predicted_minutes ?? 10) * 60000 : 0))
      .reduce((a, b) => Math.max(a, b), 0);
    return {
      id: d.id,
      name: d.full_name,
      room: d.room,
      waiting: waiting.length,
      waitMinutes: lastEnd ? (minutesUntil(new Date(lastEnd).toISOString()) ?? 0) : 0,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm font-medium text-brand-strong">
          KlinikFlow
        </Link>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Ambil antrean dari rumah</h1>
        <p className="text-[15px] leading-relaxed text-muted">
          Daftar sekarang, lalu pantau giliran Anda dari ponsel. Kami kabari lewat WhatsApp saat giliran Anda
          sudah dekat, jadi Anda bisa datang tepat waktu.
        </p>
      </header>

      {options.length === 0 ? (
        <p className="rounded-[12px] border border-line bg-white p-4 text-sm text-muted">
          Belum ada dokter yang praktik saat ini.
        </p>
      ) : (
        <IntakeForm doctors={options} />
      )}

      <p className="text-xs leading-relaxed text-faint">
        Data Anda hanya dipakai untuk antrean di klinik ini. Estimasi waktu bisa berubah mengikuti pemeriksaan
        pasien sebelumnya.
      </p>
    </main>
  );
}
