import Link from "next/link";
import { Suspense } from "react";

import { Brand } from "@/components/brand";
import { ArrowRightIcon, BellIcon, ClockIcon } from "@/components/icons";
import { DoctorCarousel } from "@/components/queue/doctor-carousel";
import { PrintLabel, Ticket } from "@/components/ticket";
import { getQueueBoard } from "@/lib/queue/board";

const STEPS = [
  { n: "1", title: "Ambil nomor", text: "Isi nama dan keluhan, 1 menit." },
  { n: "2", title: "Pantau dari ponsel", text: "Lihat sisa antrean kapan saja." },
  { n: "3", title: "Datang tepat waktu", text: "Kami kabari lewat WhatsApp." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-4 sm:px-6">
        <Brand />
        <Link href="/login" className="btn btn-quiet btn-sm min-h-[44px]">
          Masuk staf
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-0">
        <section className="flex flex-col gap-7">
          <h1 className="max-w-[14ch] text-[40px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[56px]">
            Antre dari rumah. Datang saat giliran.
          </h1>
          <p className="max-w-[40ch] text-[17px] leading-relaxed text-muted">
            Tidak perlu menunggu lama di ruang tunggu klinik.
          </p>
          <div>
            <Link href="/intake" className="btn btn-primary btn-lg w-full sm:w-auto sm:px-8">
              Ambil antrean
              <ArrowRightIcon />
            </Link>
          </div>

          <ol className="mt-4 grid gap-5 border-t border-line pt-7 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3 sm:flex-col sm:gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-tint font-mono text-sm font-semibold text-accent-strong">
                  {s.n}
                </span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="mx-auto w-full max-w-[380px]">
          <Suspense
            fallback={
              <div className="lg:rotate-[2deg]" aria-hidden="true">
                <SampleTicket />
              </div>
            }
          >
            <LiveQueues />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

// Live ticket per doctor; the sample ticket stays as the loading shape and
// for a clinic with no doctors yet.
async function LiveQueues() {
  const doctors = await getQueueBoard();
  if (doctors.length === 0) {
    return (
      <div className="lg:rotate-[2deg]" aria-hidden="true">
        <SampleTicket />
      </div>
    );
  }
  return <DoctorCarousel doctors={doctors} />;
}

// Product visual: the real ticket shape with sample data.
function SampleTicket() {
  return (
    <Ticket
      className="enter-rise"
      stub={
        <div className="grid grid-cols-2 gap-4 px-6 pb-6 pt-6">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <ClockIcon size={14} /> Dipanggil sekitar
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em]">10.25</p>
          </div>
          <div>
            <p className="text-xs text-muted">Di depan Anda</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em]">3 orang</p>
          </div>
          <p className="col-span-2 flex items-center gap-2 rounded-[10px] bg-tint px-3 py-2.5 text-sm font-medium text-ink">
            <BellIcon size={16} className="text-accent" />
            Datang sebelum 10.10
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-5 px-6 pb-7 pt-6">
        <div className="flex items-center justify-between">
          <PrintLabel>Nomor antrean</PrintLabel>
          <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-semibold text-accent-strong">Menunggu</span>
        </div>
        <p className="text-[84px] font-extrabold leading-[0.9] tracking-[-0.05em] tabular-nums">A-007</p>
        <div className="flex justify-between text-sm">
          <span className="font-semibold">dr. Sari Wulandari</span>
          <span className="text-muted">Poli Umum 1</span>
        </div>
      </div>
    </Ticket>
  );
}
