import Link from "next/link";

export default function TicketNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Tiket tidak ditemukan</h1>
      <p className="text-sm text-muted">Periksa kembali tautan Anda, atau ambil antrean baru.</p>
      <Link
        href="/intake"
        className="mx-auto mt-2 inline-flex min-h-[48px] items-center rounded-full bg-ink px-6 text-sm font-semibold text-white hover:opacity-90"
      >
        Ambil antrean
      </Link>
    </main>
  );
}
