import type { Metadata } from "next";

import { DoctorSummaryCard, EstimateSourceBadge } from "@/components/ai";
import { StaffHeader } from "@/components/staff-header";
import { requireStaff } from "@/lib/auth/dal";
import { clinicToday } from "@/lib/clinic-time";
import { TICKET_STATUS_LABEL, ticketCode } from "@/lib/queue/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dokter · KlinikFlow",
};

function ageInYears(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

// Doctor view: only this doctor's queue (row-level security returns nothing
// else), with complaints and AI summaries but no patient contact data.
export default async function DoctorPage() {
  const staff = await requireStaff("doctor");
  const supabase = await createClient();
  const today = clinicToday();

  if (!staff.doctorId) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
        <StaffHeader staff={staff} title="Antrean saya" />
        <p className="text-amber-700 dark:text-amber-400">
          Akun ini belum terhubung ke data dokter. Hubungi admin klinik.
        </p>
      </main>
    );
  }

  const [{ data: doctor }, { data: tickets, error }] = await Promise.all([
    supabase.from("doctors").select("full_name, room, ticket_prefix").eq("id", staff.doctorId).single(),
    supabase
      .from("queue_tickets")
      .select(
        "id, ticket_number, position, status, complaint, is_follow_up, predicted_minutes, prediction_source, prediction_confidence, prediction_model, ai_summary, defer_count, patients (full_name, birth_date)",
      )
      .eq("doctor_id", staff.doctorId)
      .eq("service_date", today)
      .order("position"),
  ]);

  const prefix = doctor?.ticket_prefix ?? "?";
  const active = ["waiting", "called", "in_consultation"] as const;
  const queue = tickets?.filter((t) => (active as readonly string[]).includes(t.status)) ?? [];
  const finished = (tickets?.length ?? 0) - queue.length;
  const current =
    queue.find((t) => t.status === "in_consultation") ?? queue.find((t) => t.status === "called") ?? queue[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <StaffHeader staff={staff} title={`Antrean saya · ${doctor?.room ?? ""}`} />

      {error ? <p className="text-red-700 dark:text-red-400">Gagal memuat antrean: {error.message}</p> : null}

      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Pasien saat ini</h2>
          <DoctorSummaryCard
            ticket={
              current
                ? {
                    ticketCode: ticketCode(prefix, current.ticket_number),
                    patientName: current.patients?.full_name,
                    patientAgeYears: ageInYears(current.patients?.birth_date, today),
                    isFollowUp: current.is_follow_up,
                    complaint: current.complaint,
                    predictedMinutes: current.predicted_minutes,
                    predictionSource: current.prediction_source,
                    predictionConfidence: current.prediction_confidence,
                    predictionModel: current.prediction_model,
                    aiSummary: current.ai_summary,
                  }
                : null
            }
          />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Antrean</h2>
            <p className="text-sm text-zinc-500">
              {queue.length} aktif · {finished} selesai
            </p>
          </div>
          <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {queue.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    <span className="font-mono">{ticketCode(prefix, t.ticket_number)}</span> · {t.patients?.full_name}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">{t.complaint}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span>{TICKET_STATUS_LABEL[t.status]}</span>
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    {t.predicted_minutes ?? "–"} mnt
                    {t.prediction_source ? <EstimateSourceBadge source={t.prediction_source} compact /> : null}
                  </span>
                </div>
              </li>
            ))}
            {queue.length === 0 ? <li className="px-4 py-4 text-sm text-zinc-500">Tidak ada pasien menunggu.</li> : null}
          </ol>
        </section>
      </div>
    </main>
  );
}
