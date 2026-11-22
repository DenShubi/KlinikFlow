import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ChevronDownIcon, SparkIcon } from "@/components/icons";
import { ActionButton } from "@/components/queue/action-button";
import { ElapsedTimer } from "@/components/queue/elapsed-timer";
import { LiveRefresh } from "@/components/queue/live-refresh";
import { PageTitle, StaffHeader } from "@/components/staff-header";
import { PrintLabel, Ticket } from "@/components/ticket";
import { ageInYears } from "@/lib/age";
import { requireStaff } from "@/lib/auth/dal";
import { clinicToday, formatClinicDate, formatClinicTime, minutesUntil } from "@/lib/clinic-time";
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
      <>
        <StaffHeader staff={staff} href="/doctor" />
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
          <PageTitle title="Antrean saya" />
          <p className="rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">
            Akun ini belum terhubung ke data dokter. Hubungi admin klinik.
          </p>
        </main>
      </>
    );
  }

  const [{ data: doctor }, { data: tickets, error }] = await Promise.all([
    supabase
      .from("doctors")
      .select("full_name, specialty, room, ticket_prefix")
      .eq("id", staff.doctorId)
      .single(),
    supabase
      .from("queue_tickets")
      .select(
        "id, ticket_number, position, status, channel, checked_in_at, called_at, started_at, estimated_call_at, actual_minutes, complaint, is_follow_up, predicted_minutes, prediction_source, ai_summary, defer_count, missed_turn_at, patients (full_name, birth_date)",
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
  const queue = waiting.filter((t) => t.id !== shown?.id);

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const avgActual = avg(done.map((t) => Number(t.actual_minutes ?? 0)).filter((m) => m > 0));
  const last = waiting.filter((t) => t.estimated_call_at).at(-1);
  const queueEnds = last?.estimated_call_at
    ? new Date(Date.parse(last.estimated_call_at) + (last.predicted_minutes ?? FALLBACK_MINUTES) * 60000).toISOString()
    : null;

  const state = inConsultation ? "consult" : called ? "called" : "next";
  const stateLabel = { consult: "Sedang diperiksa", called: "Dipanggil", next: "Berikutnya" }[state];
  const age = shown ? ageInYears(shown.patients?.birth_date, today) : undefined;
  const summary = shown?.ai_summary?.trim();

  return (
    <>
      <StaffHeader staff={staff} href="/doctor" />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <PageTitle
          title="Antrean saya"
          sub={`${doctor?.specialty ?? "Dokter Umum"} · ${doctor?.room ?? "Ruang periksa"} · ${formatClinicDate(today)}`}
          aside={<LiveRefresh serviceDate={today} />}
        />

        {error ? (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">
            Antrean gagal dimuat. Muat ulang halaman.
          </p>
        ) : null}

        <section aria-label="Ringkasan hari ini" className="card grid grid-cols-2 lg:grid-cols-4">
          <Stat label="Menunggu" value={String(waiting.length)} note={`${arrived.length} sudah hadir`} />
          <Stat label="Selesai" value={String(done.length)} note="pasien hari ini" />
          <Stat label="Rata-rata periksa" value={avgActual === null ? "–" : `${avgActual} mnt`} note="per pasien" />
          <Stat
            label="Antrean selesai"
            value={queueEnds ? formatClinicTime(queueEnds) : "–"}
            note={queueEnds ? `±${minutesUntil(queueEnds)} mnt lagi` : "tidak ada antrean"}
          />
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Ticket
            label="Pasien saat ini"
            stubTone={state === "called" ? "accent" : state === "consult" ? "ink" : "plain"}
            stub={
              <div className="px-6 pb-6 pt-6">
                {inConsultation ? (
                  <ActionButton
                    action={finishConsultation.bind(null, inConsultation.id)}
                    label="Selesai periksa"
                    size="lg"
                    className="w-full"
                  />
                ) : called ? (
                  <ActionButton
                    action={startConsultation.bind(null, called.id)}
                    label="Pasien masuk · Mulai periksa"
                    variant="onAccent"
                    size="lg"
                    className="w-full"
                  />
                ) : (
                  <ActionButton
                    action={callNext.bind(null, staff.doctorId)}
                    label={next ? `Panggil ${ticketCode(prefix, next.ticket_number)}` : "Belum ada yang bisa dipanggil"}
                    disabled={!next}
                    size="lg"
                    className="w-full"
                  />
                )}
              </div>
            }
          >
            <div className="flex flex-col gap-5 px-6 pb-7 pt-6">
              <div className="flex items-center justify-between gap-3">
                <PrintLabel>{stateLabel}</PrintLabel>
                {inConsultation?.started_at ? (
                  <span className="text-lg font-bold">
                    <ElapsedTimer since={inConsultation.started_at} predictedMinutes={inConsultation.predicted_minutes} />
                  </span>
                ) : called?.called_at ? (
                  <span className="flex items-baseline gap-1.5 text-sm text-muted">
                    menunggu <span className="text-lg font-bold"><ElapsedTimer since={called.called_at} /></span>
                  </span>
                ) : null}
              </div>

              {shown ? (
                <>
                  <div>
                    <p className="text-[64px] font-extrabold leading-[0.9] tracking-[-0.05em] tabular-nums">
                      {ticketCode(prefix, shown.ticket_number)}
                    </p>
                    <p className="mt-3 text-xl font-bold tracking-[-0.02em]">{shown.patients?.full_name}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Tag>{shown.is_follow_up ? "Kontrol" : "Kunjungan baru"}</Tag>
                      {age !== undefined ? <Tag>{age} thn</Tag> : null}
                      {shown.predicted_minutes ? <Tag>±{shown.predicted_minutes} mnt</Tag> : null}
                    </div>
                  </div>

                  <div className="rounded-[14px] bg-canvas p-4 shadow-[inset_0_0_0_1px_var(--color-line-soft)]">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      {summary ? <SparkIcon size={14} className="text-accent" /> : null}
                      Keluhan
                    </p>
                    <p className="mt-1.5 text-[15px] leading-relaxed">{summary || shown.complaint}</p>
                    {summary && summary !== shown.complaint.trim() ? (
                      <details className="group mt-3">
                        <summary className="flex min-h-[32px] cursor-pointer list-none items-center gap-1 text-xs font-semibold text-accent-strong [&::-webkit-details-marker]:hidden">
                          Tulisan pasien
                          <ChevronDownIcon size={14} className="transition-transform group-open:rotate-180" />
                        </summary>
                        <p className="mt-1 text-sm leading-relaxed text-muted">{shown.complaint}</p>
                      </details>
                    ) : null}
                  </div>
                  {summary ? <p className="-mt-2 text-[11px] text-muted">Ringkasan otomatis, bukan diagnosis.</p> : null}
                </>
              ) : (
                <div className="py-4">
                  <p className="text-[26px] font-extrabold tracking-[-0.03em]">
                    {waiting.length ? "Belum ada pasien hadir" : "Antrean kosong"}
                  </p>
                  <p className="mt-1 text-muted">
                    {waiting.length
                      ? `${waiting.length} pasien online belum tiba di klinik.`
                      : "Pasien baru akan muncul di sini."}
                  </p>
                </div>
              )}
            </div>
          </Ticket>

          <section aria-label="Antrean" className="flex flex-col gap-4">
            <div className="card overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-line-soft px-5 py-4">
                <h2 className="text-[17px] font-bold">Antrean berikutnya</h2>
                <p className="text-sm tabular-nums text-muted">{queue.length} pasien</p>
              </div>
              <ol>
                {queue.map((t, i) => {
                  const tAge = ageInYears(t.patients?.birth_date, today);
                  return (
                    <li key={t.id} className="flex gap-3.5 border-b border-line-soft px-5 py-4 last:border-b-0">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-tint text-xs font-semibold tabular-nums text-accent-strong">
                        {i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate">
                            <span className="font-mono text-sm font-semibold">{ticketCode(prefix, t.ticket_number)}</span>
                            <span className="ml-2 font-semibold">{t.patients?.full_name}</span>
                          </p>
                          <p className="shrink-0 text-xs font-medium tabular-nums text-muted">
                            {t.checked_in_at && t.estimated_call_at ? formatClinicTime(t.estimated_call_at) : null}
                          </p>
                        </div>
                        <p className="line-clamp-1 text-sm text-muted">{t.complaint}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {t.predicted_minutes ? <Tag>±{t.predicted_minutes} mnt</Tag> : null}
                          {t.is_follow_up ? <Tag>Kontrol</Tag> : null}
                          {tAge !== undefined ? <Tag>{tAge} thn</Tag> : null}
                          {!t.checked_in_at ? (
                            <Tag tone="warn">{t.missed_turn_at ? "Terlewat · belum tiba" : "Belum tiba"}</Tag>
                          ) : null}
                          {t.defer_count > 0 ? <Tag tone="warn">Ditunda {t.defer_count}×</Tag> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {queue.length === 0 ? (
                  <li className="px-5 py-10 text-center text-sm text-muted">Tidak ada antrean lagi.</li>
                ) : null}
              </ol>
            </div>

            {done.length ? (
              <details className="group card overflow-hidden">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  Selesai hari ini · {done.length}
                  <ChevronDownIcon size={16} className="text-muted transition-transform group-open:rotate-180" />
                </summary>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-t border-line-soft">
                      <th className="px-5 py-2 font-medium">Tiket</th>
                      <th className="px-5 py-2 font-medium">Pasien</th>
                      <th className="px-5 py-2 text-right font-medium">Lama periksa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((t) => (
                      <tr key={t.id} className="border-t border-line-soft">
                        <td className="px-5 py-2.5 font-mono">{ticketCode(prefix, t.ticket_number)}</td>
                        <td className="max-w-0 truncate px-5 py-2.5">{t.patients?.full_name}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">
                          {t.actual_minutes != null ? `${Math.round(Number(t.actual_minutes))} mnt` : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-line-soft px-5 py-4 [&:nth-child(2n)]:border-l [&:nth-child(n+3)]:border-t lg:[&:nth-child(n+3)]:border-t-0 lg:[&:not(:first-child)]:border-l">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-1.5 text-xs text-muted">{note}</p>
    </div>
  );
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  const cls = tone === "warn" ? "bg-warn-soft text-warn" : "bg-tint text-ink";
  return <span className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
