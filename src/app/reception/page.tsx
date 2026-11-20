import type { Metadata } from "next";

import { EstimateSourceBadge } from "@/components/ai";
import { ActionButton } from "@/components/queue/action-button";
import { LiveRefresh } from "@/components/queue/live-refresh";
import { StaffHeader } from "@/components/staff-header";
import { requireStaff } from "@/lib/auth/dal";
import { clinicToday, formatClinicTime, minutesUntil } from "@/lib/clinic-time";
import { cancelTicket, checkIn } from "@/lib/queue/actions";
import { TICKET_CHANNEL_LABEL, TICKET_STATUS_LABEL, ticketCode } from "@/lib/queue/labels";
import { createClient } from "@/lib/supabase/server";

import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = {
  title: "Resepsionis · KlinikFlow",
};

// Receptionist view: today's queue of every doctor, with patient contact data.
// The full receptionist screen (one-click walk-in, deferred states) builds on this.
export default async function ReceptionPage() {
  const staff = await requireStaff("receptionist");
  const supabase = await createClient();
  const today = clinicToday();

  const [{ data: doctors }, { data: tickets, error }] = await Promise.all([
    supabase.from("doctors").select("id, full_name, room, ticket_prefix").order("ticket_prefix"),
    supabase
      .from("queue_tickets")
      .select(
        "id, doctor_id, ticket_number, position, channel, status, predicted_minutes, prediction_source, defer_count, checked_in_at, estimated_call_at, patients (full_name, phone)",
      )
      .eq("service_date", today)
      .order("position"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <StaffHeader staff={staff} title="Antrean hari ini" />
      <LiveRefresh serviceDate={today} />

      {error ? <p className="text-red-700 dark:text-red-400">Gagal memuat antrean: {error.message}</p> : null}

      <NewTicketForm
        doctors={(doctors ?? []).map((d) => ({ id: d.id, label: `${d.ticket_prefix} · ${d.full_name} (${d.room})` }))}
      />

      {doctors?.map((doctor) => {
        const queue = tickets?.filter((t) => t.doctor_id === doctor.id) ?? [];
        const waiting = queue.filter((t) => t.status === "waiting").length;
        return (
          <section key={doctor.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {doctor.full_name} <span className="font-normal text-zinc-500">· {doctor.room}</span>
              </h2>
              <p className="text-sm text-zinc-500">
                {waiting} menunggu · {queue.length} tiket
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2 font-medium">Tiket</th>
                    <th className="px-3 py-2 font-medium">Pasien</th>
                    <th className="px-3 py-2 font-medium">WhatsApp</th>
                    <th className="px-3 py-2 font-medium">Jalur</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Estimasi</th>
                    <th className="px-3 py-2 font-medium">Perkiraan dipanggil</th>
                    <th className="px-3 py-2 font-medium">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {queue.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 font-mono">{ticketCode(doctor.ticket_prefix, t.ticket_number)}</td>
                      <td className="px-3 py-2">{t.patients?.full_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{t.patients?.phone ?? "–"}</td>
                      <td className="px-3 py-2">
                        {TICKET_CHANNEL_LABEL[t.channel]}
                        {t.channel === "remote" && !t.checked_in_at ? (
                          <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">(belum tiba)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {TICKET_STATUS_LABEL[t.status]}
                        {t.defer_count > 0 ? (
                          <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">(ditunda {t.defer_count}×)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {t.predicted_minutes ?? "–"} mnt
                          {t.prediction_source ? <EstimateSourceBadge source={t.prediction_source} compact /> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {t.status === "waiting" ? (
                          <>
                            {formatClinicTime(t.estimated_call_at)}{" "}
                            <span className="text-zinc-500">(±{minutesUntil(t.estimated_call_at)} mnt)</span>
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          {t.channel === "remote" && !t.checked_in_at && (t.status === "waiting" || t.status === "called") ? (
                            <ActionButton action={checkIn.bind(null, t.id)} label="Tiba" size="sm" variant="secondary" />
                          ) : null}
                          {t.status === "waiting" || t.status === "called" ? (
                            <ActionButton action={cancelTicket.bind(null, t.id)} label="Batalkan" size="sm" variant="danger" />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-4 text-zinc-500">
                        Belum ada tiket hari ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
}
