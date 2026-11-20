import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Brand } from "@/components/brand";
import { ArrowLeftIcon } from "@/components/icons";
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
      prefix: d.ticket_prefix,
      waiting: waiting.length,
      waitMinutes: lastEnd ? (minutesUntil(new Date(lastEnd).toISOString()) ?? 0) : 0,
    };
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[480px] items-center justify-between px-4 pt-4">
        <Link href="/" className="btn btn-quiet -ml-3 px-3" aria-label="Kembali ke beranda">
          <ArrowLeftIcon />
        </Link>
        <Brand />
        <span className="w-11" aria-hidden />
      </header>

      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-6 px-4 pb-12 pt-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.035em]">Ambil antrean</h1>
          <p className="text-muted">Nomor Anda langsung jadi setelah daftar.</p>
        </div>

        {options.length === 0 ? (
          <div className="card px-5 py-8 text-center">
            <p className="font-semibold">Belum ada dokter praktik</p>
            <p className="mt-1 text-sm text-muted">Coba lagi nanti.</p>
          </div>
        ) : (
          <IntakeForm doctors={options} />
        )}
      </main>
    </div>
  );
}
