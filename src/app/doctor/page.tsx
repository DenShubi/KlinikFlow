import type { Metadata } from "next";

import { DoctorSummaryCard, EstimateSourceBadge } from "@/components/ai";
import { ActionButton } from "@/components/queue/action-button";
import { ElapsedTimer } from "@/components/queue/elapsed-timer";
import { LiveRefresh } from "@/components/queue/live-refresh";
import { StaffHeader } from "@/components/staff-header";
import { ageInYears } from "@/lib/age";
import { requireStaff } from "@/lib/auth/dal";
import { clinicToday, formatClinicTime, minutesUntil } from "@/lib/clinic-time";
import { callNext, finishConsultation, startConsultation } from "@/lib/queue/actions";
import { ticketCode } from "@/lib/queue/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dokter · KlinikFlow",
};

const FALLBACK_MINUTES = 10;

// Doctor dashboard: today's own queue only (row-level security returns
// nothing else), with complaint summaries but no patient contact data.
export default async function DoctorPage() {
  const staff = await requireStaff("doctor");
  const supabase = await createClient();
  const today = clinicToday();

  if (!staff.doctorId) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <StaffHeader staff={staff} title="Antrean saya" />
        <p className="rounded-[12px] border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
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
        "id, ticket_number, position, status, channel, checked_in_at, called_at, started_at, estimated_call_at, actual_minutes, complaint, is_follow_up, predicted_minutes, prediction_source, prediction_confidence, prediction_model, ai_summary, defer_count, patients (full_name, birth_date)",
      )
      .eq("doctor_id", staff.doctorId)
      .eq("service_date", today)
      .order("position"),
  ]);

  const prefix = doctor?.ticket_prefix ?? "?";
  const all = tickets ?? [];
  const inConsultation = all.find((t) => t.status === "in_consultation");
  const called = all.find((t) => t.status === "called");
  const current = inConsultation ?? called;
  const waiting = all.filter((t) => t.status === "waiting");
  const arrived = waiting.filter((t) => t.checked_in_at);
  const next = arrived[0];
  const done = all.filter((t) => t.status === "done");
  const shown = current ?? next;

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const avgActual = avg(done.map((t) => Number(t.actual_minutes ?? 0)).filter((m) => m > 0));
  const avgPredicted = avg(done.map((t) => t.predicted_minutes ?? FALLBACK_MINUTES));
  const last = waiting.at(-1);
  const queueEnds = last?.estimated_call_at
    ? new Date(Date.parse(last.estimated_call_at) + (last.predicted_minutes ?? FALLBACK_MINUTES) * 60000).toISOString()
    : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <StaffHeader
        staff={staff}
        title={`${doctor?.room ?? "Ruang periksa"} · Antrean saya`}
        aside={<LiveRefresh serviceDate={today} />}
      />

      {error ? (
        <p className="rounded-[12px] bg-danger-soft px-4 py-3 text-sm text-danger">Gagal memuat antrean: {error.message}</p>
      ) : null}

      <section aria-label="Ringkasan hari ini" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Menunggu" value={String(waiting.length)} note={`${arrived.length} sudah hadir`} />
        <Stat label="Selesai hari ini" value={String(done.length)} note={done.length ? "pasien" : "belum ada"} />
        <Stat
          label="Rata-rata periksa"
          value={avgActual === null ? "–" : `${avgActual} mnt`}
          note={avgPredicted === null ? "belum ada data" : `estimasi rata-rata ${avgPredicted} mnt`}
        />
        <Stat
          label="Antrean selesai sekitar"
          value={queueEnds ? formatClinicTime(queueEnds) : "–"}
          note={queueEnds ? `±${minutesUntil(queueEnds)} mnt lagi` : "tidak ada antrean"}
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-label="Pasien saat ini" className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                  {inConsultation ? "Sedang diperiksa" : called ? "Dipanggil, menunggu pasien masuk" : "Berikutnya"}
                </p>
                <p className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.05em] tabular-nums">
                  {shown ? ticketCode(prefix, shown.ticket_number) : "–"}
                </p>
                <p className="mt-2 text-sm text-muted">
                  {shown ? shown.patients?.full_name : waiting.length ? "Belum ada pasien yang hadir" : "Tidak ada pasien menunggu"}
                </p>
              </div>
              {inConsultation?.started_at ? (
                <div className="text-right">
                  <p className="text-xs text-muted">Lama periksa</p>
                  <p className="text-2xl font-semibold">
                    <ElapsedTimer since={inConsultation.started_at} predictedMinutes={inConsultation.predicted_minutes} />
                  </p>
                </div>
              ) : called?.called_at ? (
                <div className="text-right">
                  <p className="text-xs text-muted">Dipanggil sejak</p>
                  <p className="text-2xl font-semibold">
                    <ElapsedTimer since={called.called_at} />
                  </p>
                </div>
              ) : null}
            </div>

            {inConsultation ? (
              <ActionButton
                action={finishConsultation.bind(null, inConsultation.id)}
                label="Selesai pemeriksaan"
                size="lg"
                className="w-full"
              />
            ) : called ? (
              <ActionButton
                action={startConsultation.bind(null, called.id)}
                label="Pasien masuk, mulai periksa"
                size="lg"
                className="w-full"
              />
            ) : (
              <ActionButton
                action={callNext.bind(null, staff.doctorId)}
                label={next ? `Panggil ${ticketCode(prefix, next.ticket_number)}` : "Panggil pasien berikutnya"}
                size="lg"
                className="w-full"
              />
            )}
          </div>

          <DoctorSummaryCard
            ticket={
              shown
                ? {
                    ticketCode: ticketCode(prefix, shown.ticket_number),
                    patientName: shown.patients?.full_name,
                    patientAgeYears: ageInYears(shown.patients?.birth_date, today) ?? null,
                    isFollowUp: shown.is_follow_up,
                    complaint: shown.complaint,
                    predictedMinutes: shown.predicted_minutes,
                    predictionSource: shown.prediction_source,
                    predictionConfidence: shown.prediction_confidence,
                    predictionModel: shown.prediction_model,
                    aiSummary: shown.ai_summary,
                  }
                : null
            }
          />
        </section>

        <section aria-label="Antrean" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Antrean berikutnya</h2>
            <p className="text-sm text-muted">{waiting.length} pasien</p>
          </div>

          <ol className="overflow-hidden rounded-[18px] border border-line bg-white">
            {waiting.map((t, i) => {
              const age = ageInYears(t.patients?.birth_date, today);
              return (
                <li key={t.id} className="flex gap-3 border-b border-line-soft px-4 py-3.5 last:border-b-0">
                  <span className="w-5 shrink-0 pt-0.5 text-sm tabular-nums text-faint">{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="truncate font-medium">
                        <span className="tabular-nums">{ticketCode(prefix, t.ticket_number)}</span>
                        <span className="text-muted"> · {t.patients?.full_name}</span>
                      </p>
                      <p className="shrink-0 text-xs tabular-nums text-muted">
                        {t.checked_in_at ? `±${minutesUntil(t.estimated_call_at)} mnt` : null}
                      </p>
                    </div>
                    <p className="line-clamp-1 text-sm text-muted">{t.complaint}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {t.prediction_source ? (
                        <>
                          <span className="tabular-nums text-muted">{t.predicted_minutes} mnt</span>
                          <EstimateSourceBadge source={t.prediction_source} compact />
                        </>
                      ) : null}
                      {t.is_follow_up ? <Tag>Kontrol</Tag> : null}
                      {age !== undefined ? <Tag>{age} thn</Tag> : null}
                      {!t.checked_in_at ? <Tag tone="warn">Belum tiba</Tag> : null}
                      {t.defer_count > 0 ? <Tag tone="warn">Ditunda {t.defer_count}×</Tag> : null}
                    </div>
                  </div>
                </li>
              );
            })}
            {waiting.length === 0 ? <li className="px-4 py-6 text-sm text-muted">Tidak ada pasien menunggu.</li> : null}
          </ol>

          <details className="group rounded-[18px] border border-line bg-white">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              Selesai hari ini ({done.length})
              <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-t border-line-soft">
                  <th className="px-4 py-2 font-medium">Tiket</th>
                  <th className="px-4 py-2 font-medium">Pasien</th>
                  <th className="px-4 py-2 text-right font-medium">Estimasi</th>
                  <th className="px-4 py-2 text-right font-medium">Aktual</th>
                </tr>
              </thead>
              <tbody>
                {done.map((t) => (
                  <tr key={t.id} className="border-t border-line-soft">
                    <td className="px-4 py-2 tabular-nums">{ticketCode(prefix, t.ticket_number)}</td>
                    <td className="truncate px-4 py-2 text-muted">{t.patients?.full_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.predicted_minutes ?? "–"} mnt</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {t.actual_minutes != null ? `${Math.round(Number(t.actual_minutes))} mnt` : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-white px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  const cls = tone === "warn" ? "border-warn-line bg-warn-soft text-warn" : "border-line-soft bg-surface text-muted";
  return <span className={`inline-flex items-center rounded-[6px] border px-1.5 py-0.5 ${cls}`}>{children}</span>;
}
