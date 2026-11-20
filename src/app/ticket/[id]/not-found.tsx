import Link from "next/link";

import { Brand } from "@/components/brand";
import { PrintLabel, Ticket } from "@/components/ticket";

export default function TicketNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex justify-center">
        <Brand />
      </div>
      <Ticket
        stub={
          <div className="px-6 pb-6 pt-6">
            <Link href="/intake" className="btn btn-primary w-full">
              Ambil antrean baru
            </Link>
          </div>
        }
      >
        <div className="flex flex-col gap-2 px-6 pb-7 pt-6 text-center">
          <PrintLabel>Nomor antrean</PrintLabel>
          <p className="text-[64px] font-extrabold leading-none tracking-[-0.05em] text-line">?-???</p>
          <h1 className="mt-2 text-xl font-bold">Tiket tidak ditemukan</h1>
          <p className="text-sm text-muted">Periksa kembali tautan Anda.</p>
        </div>
      </Ticket>
    </main>
  );
}
