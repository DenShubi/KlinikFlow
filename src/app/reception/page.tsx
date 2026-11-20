import type { Metadata } from "next";

import { ChevronDownIcon } from "@/components/icons";
import { ActionButton } from "@/components/queue/action-button";
import { LiveRefresh } from "@/components/queue/live-refresh";
import { PageTitle, StaffHeader } from "@/components/staff-header";
import { requireStaff } from "@/lib/auth/dal";
import { clinicToday, formatClinicDate, formatClinicTime, minutesUntil } from "@/lib/clinic-time";
import { cancelTicket, checkIn } from "@/lib/queue/actions";
import { TICKET_STATUS_LABEL, ticketCode } from "@/lib/queue/labels";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = {
  title: "Resepsionis · KlinikFlow",
};

type Status = Database["public"]["Enums"]["ticket_status"];

const STATUS_CHIP: Record<Status, string> = {
  waiting: "bg-tint text-accent-strong",
  called: "bg-accent text-white",
  in_consultation: "bg-ink text-white",
  done: "bg-ok-soft text-ok",
  cancelled: "bg-line-soft text-muted",
  no_show: "bg-danger-soft text-danger",
};

// Receptionist view: today's queue of every doctor, with patient contact data.
const ACTIVE: Status[] = ["waiting", "called", "in_consultation"];

type Row = {
  id: string;
  ticket_number: number;
  channel: Database["public"]["Enums"]["ticket_channel"];
  status: Status;
  defer_count: number;
  checked_in_at: string | null;
  estimated_call_at: string | null;
  missed_turn_at: string | null;
  patients: { full_name: string; phone: string | null } | null;
};

function QueueTable({ prefix, rows, muted = false }: { prefix: string; rows: Row[]; muted?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full min-w-[680px] text-left text-sm ${muted ? "text-muted" : ""}`}>
        <thead className="text-xs text-muted">
          <tr>
            <th className="w-[88px] px-5 py-2.5 font-medium">Tiket</th>
            <th className="px-5 py-2.5 font-medium">Pasien</th>
            <th className="px-5 py-2.5 font-medium">Status</th>
            <th className="whitespace-nowrap px-5 py-2.5 text-right font-medium">Dipanggil</th>
            <th className="w-px px-5 py-2.5">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const open = t.status === "waiting" || t.status === "called";
            const notArrived = t.channel === "remote" && !t.checked_in_at && open;
            return (
              <tr key={t.id} className="border-t border-line-soft">
                <td className="whitespace-nowrap px-5 py-3 font-mono font-semibold">{ticketCode(prefix, t.ticket_number)}</td>
                <td className="px-5 py-3">
                  <p className={muted ? "" : "font-semibold"}>{t.patients?.full_name}</p>
                  <p className="whitespace-nowrap text-xs text-muted">
                    {t.channel === "remote" ? "Online" : "Datang langsung"}
                    {t.patients?.phone ? <span className="font-mono"> · {t.patients.phone}</span> : null}
                  </p>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[t.status]}`}>
                      {TICKET_STATUS_LABEL[t.status]}
                    </span>
                    {notArrived ? (
                      <span className="whitespace-nowrap rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">
                        {t.missed_turn_at ? "Terlewat" : "Belum tiba"}
                      </span>
                    ) : null}
                    {t.defer_count > 0 && open ? (
                      <span className="whitespace-nowrap rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">
                        Ditunda {t.defer_count}×
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                  {t.status === "waiting" && t.estimated_call_at ? (
                    <>
                      <span className="font-semibold">{formatClinicTime(t.estimated_call_at)}</span>
                      <span className="block text-xs text-muted">±{minutesUntil(t.estimated_call_at)} mnt</span>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="px-5 py-3">
                  {open ? (
                    <div className="flex justify-end gap-2">
                      {notArrived ? (
                        <ActionButton action={checkIn.bind(null, t.id)} label="Tandai tiba" size="sm" variant="secondary" />
                      ) : null}
                      <ActionButton action={cancelTicket.bind(null, t.id)} label="Batalkan" size="sm" variant="danger" />
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReceptionPage() {
  const staff = await requireStaff("receptionist");
  const supabase = await createClient();
  const today = clinicToday();

  const [{ data: doctors }, { data: tickets, error }] = await Promise.all([
    supabase.from("doctors").select("id, full_name, room, ticket_prefix").order("ticket_prefix"),
    supabase
      .from("queue_tickets")
      .select(
        "id, doctor_id, ticket_number, position, channel, status, predicted_minutes, defer_count, checked_in_at, estimated_call_at, missed_turn_at, patients (full_name, phone)",
      )
      .eq("service_date", today)
      .order("position"),
  ]);

  return (
    <>
      <StaffHeader staff={staff} href="/reception" />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <PageTitle title="Antrean hari ini" sub={formatClinicDate(today)} aside={<LiveRefresh serviceDate={today} />} />

        {error ? (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">
            Antrean gagal dimuat. Muat ulang halaman.
          </p>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-24">
            <NewTicketForm
              doctors={(doctors ?? []).map((d) => ({
                id: d.id,
                prefix: d.ticket_prefix,
                name: d.full_name,
                room: d.room,
              }))}
            />
          </div>

          <div className="flex flex-col gap-6">
            {doctors?.map((doctor) => {
              const queue = tickets?.filter((t) => t.doctor_id === doctor.id) ?? [];
              const active = queue.filter((t) => ACTIVE.includes(t.status));
              const closed = queue.filter((t) => !ACTIVE.includes(t.status));
              const waiting = queue.filter((t) => t.status === "waiting").length;
              return (
                <section key={doctor.id} className="card overflow-hidden" aria-label={doctor.full_name}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-tint font-mono text-[15px] font-semibold text-accent-strong">
                        {doctor.ticket_prefix}
                      </span>
                      <div>
                        <h2 className="font-bold">{doctor.full_name}</h2>
                        <p className="text-[13px] text-muted">{doctor.room}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted">
                      <strong className="font-semibold tabular-nums text-ink">{waiting}</strong> menunggu
                    </p>
                  </div>

                  {active.length ? (
                    <QueueTable prefix={doctor.ticket_prefix} rows={active} />
                  ) : (
                    <p className="px-5 py-8 text-center text-sm text-muted">Tidak ada antrean aktif.</p>
                  )}

                  {closed.length ? (
                    <details className="group border-t border-line-soft">
                      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-5 text-sm font-semibold text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                        Selesai & batal · {closed.length}
                        <ChevronDownIcon size={16} className="transition-transform group-open:rotate-180" />
                      </summary>
                      <QueueTable prefix={doctor.ticket_prefix} rows={closed} muted />
                    </details>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
