import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { ArrowLeftIcon } from "@/components/icons";
import { getQueueBoard } from "@/lib/queue/board";

import { IntakeForm, type DoctorOption } from "./intake-form";

export const metadata: Metadata = {
  title: "Ambil antrean · KlinikFlow",
  description: "Daftar antrean klinik dari rumah dan pantau giliran Anda.",
};

export default async function IntakePage() {
  const board = await getQueueBoard();
  const options: DoctorOption[] = board.map((d) => ({
    id: d.id,
    name: d.name,
    room: d.room,
    prefix: d.prefix,
    waiting: d.waiting,
    waitMinutes: d.waitMinutes,
    open: d.availability.open,
    hoursNote: d.availability.note,
    hours: `${d.availability.days} · ${d.availability.hours}`,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[480px] items-center justify-between px-4 pt-4">
        <Link href="/" className="btn btn-quiet h-11 w-11 px-0" aria-label="Kembali ke beranda">
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
        ) : options.every((d) => !d.open) ? (
          <div className="card flex flex-col gap-4 px-5 py-6">
            <div>
              <p className="text-lg font-bold">Klinik sedang tutup</p>
              <p className="mt-1 text-sm text-muted">Pendaftaran dibuka lagi saat jam praktik.</p>
            </div>
            <ul className="flex flex-col gap-3 border-t border-line-soft pt-4">
              {options.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-semibold">{d.name}</span>
                    <span className="text-muted">{d.hours}</span>
                  </span>
                  <span className="shrink-0 text-right text-muted">{d.hoursNote}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <IntakeForm doctors={options} />
        )}
      </main>
    </div>
  );
}
