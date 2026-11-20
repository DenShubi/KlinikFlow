import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EstimateSourceBadge } from "@/components/ai";
import { TicketLive } from "@/components/queue/ticket-live";
import { formatClinicTime, minutesUntil } from "@/lib/clinic-time";
import { isUuid, queueTopic, type TicketPublicStatus } from "@/lib/queue/public-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Tiket antrean · KlinikFlow",
  robots: { index: false, follow: false },
};

// Arrive this many minutes before the estimated call time.
const ARRIVE_EARLY_MINUTES = 15;

// The patient's own ticket, reached through the link they got after
// registering (the ticket id is the secret). No login.
export default async function TicketPage(props: PageProps<"/ticket/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  await connection(); // live data and "minutes left" are per request

  const supabase = await createClient();
  const { data } = await supabase.rpc("ticket_public_status", { p_ticket_id: id });
  if (!data) notFound();
  const t = data as unknown as TicketPublicStatus;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-brand-strong">
          KlinikFlow
        </Link>
        <TicketLive topic={queueTopic(t.doctor_id, t.service_date)} />
      </header>

      <section className="flex flex-col gap-5 rounded-[18px] border border-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Nomor antrean</p>
            <p className="text-[56px] font-semibold leading-none tracking-[-0.05em] tabular-nums">{t.ticket_code}</p>
            <p className="mt-2 text-sm text-muted">{t.patient_short_name}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{t.doctor_name}</p>
            <p className="text-muted">{t.room}</p>
          </div>
        </div>

        <StatusBlock t={t} />

        {t.defer_count > 0 && t.status === "waiting" ? (
          <p className="rounded-[12px] border border-warn-line bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            Anda tidak ada saat dipanggil, jadi giliran Anda dipindah mundur. Segera lapor ke resepsionis.
          </p>
        ) : null}

        {t.now_serving && t.status === "waiting" ? (
          <p className="flex items-center justify-between border-t border-dashed border-line pt-4 text-sm">
            <span className="text-muted">Sedang dilayani</span>
            <span className="font-semibold tabular-nums">{t.now_serving}</span>
          </p>
        ) : null}
      </section>

      <p className="text-center text-xs leading-relaxed text-faint">
        Simpan tautan halaman ini untuk memantau giliran Anda. Estimasi bisa berubah mengikuti pemeriksaan pasien
        sebelumnya.
      </p>
    </main>
  );
}

function StatusBlock({ t }: { t: TicketPublicStatus }) {
  switch (t.status) {
    case "called":
      return (
        <div role="status" className="rounded-[14px] bg-brand px-4 py-5 text-white">
          <p className="text-2xl font-semibold tracking-[-0.02em]">Giliran Anda!</p>
          <p className="mt-1 text-[15px]">Silakan masuk ke {t.room ?? "ruang periksa"}.</p>
        </div>
      );
    case "in_consultation":
      return <Banner title="Sedang diperiksa" text={`Anda sedang bersama ${t.doctor_name}.`} />;
    case "done":
      return <Banner title="Pemeriksaan selesai" text="Terima kasih. Semoga lekas sembuh." />;
    case "cancelled":
      return <Banner title="Tiket dibatalkan" text="Daftar ulang jika Anda masih ingin diperiksa hari ini." />;
    case "no_show":
      return <Banner title="Tidak hadir" text="Anda tidak hadir saat dipanggil. Hubungi resepsionis." />;
    case "waiting":
      return <WaitingBlock t={t} />;
  }
}

function Banner({ title, text }: { title: string; text: string }) {
  return (
    <div role="status" className="rounded-[14px] bg-surface px-4 py-4">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-0.5 text-sm text-muted">{text}</p>
    </div>
  );
}

function WaitingBlock({ t }: { t: TicketPublicStatus }) {
  const minutes = minutesUntil(t.estimated_call_at);
  const arriveBy = t.estimated_call_at
    ? new Date(Date.parse(t.estimated_call_at) - ARRIVE_EARLY_MINUTES * 60000).toISOString()
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[14px] bg-surface px-4 py-3">
          <p className="text-xs text-muted">Perkiraan dipanggil</p>
          <p className="text-2xl font-semibold tabular-nums">{formatClinicTime(t.estimated_call_at)}</p>
          <p className="text-xs text-muted">{minutes === null ? "" : minutes <= 1 ? "sebentar lagi" : `±${minutes} menit lagi`}</p>
        </div>
        <div className="rounded-[14px] bg-surface px-4 py-3">
          <p className="text-xs text-muted">Di depan Anda</p>
          <p className="text-2xl font-semibold tabular-nums">{t.people_ahead}</p>
          <p className="text-xs text-muted">orang</p>
        </div>
      </div>

      {t.prediction_source ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <EstimateSourceBadge source={t.prediction_source} compact />
          <span>
            {t.prediction_source === "fallback"
              ? "Waktu tunggu dihitung dengan durasi standar klinik."
              : "Waktu tunggu dihitung dari perkiraan lama pemeriksaan."}
          </span>
        </div>
      ) : null}

      {t.checked_in ? (
        <p className="rounded-[12px] border border-line px-3.5 py-2.5 text-sm">
          Anda sudah tercatat hadir. Silakan tunggu di ruang tunggu.
        </p>
      ) : (
        <p className="rounded-[12px] border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-sm text-brand-strong">
          Datang ke klinik sebelum pukul <strong>{formatClinicTime(arriveBy)}</strong> dan tunjukkan halaman ini ke
          resepsionis.
        </p>
      )}
    </div>
  );
}
