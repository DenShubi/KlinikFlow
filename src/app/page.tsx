import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { checkSupabaseHealth } from "@/lib/supabase/health";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-10 px-4 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-brand-strong">KlinikFlow</p>
        <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.035em]">
          Antre dari rumah, datang saat giliran Anda dekat.
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">
          Pasien yang daftar online dan yang datang langsung berada di satu antrean. Pantau giliran Anda dari
          ponsel dan dapatkan kabar lewat WhatsApp.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/intake"
          className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-ink px-6 text-base font-semibold text-white hover:opacity-90"
        >
          Ambil antrean
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-line bg-white px-6 text-base font-semibold hover:bg-surface"
        >
          Masuk staf
        </Link>
      </div>

      <footer className="text-xs text-faint">
        <Suspense fallback={<span>Memeriksa koneksi…</span>}>
          <SupabaseStatus />
        </Suspense>
      </footer>
    </main>
  );
}

async function SupabaseStatus() {
  await connection(); // check on every request, not once at build time
  const health = await checkSupabaseHealth();

  if (health.status === "not_configured") {
    return (
      <span className="text-warn">
        Supabase belum dikonfigurasi: salin <code>.env.example</code> ke <code>.env.local</code> lalu isi URL dan
        kuncinya.
      </span>
    );
  }
  if (health.status === "error") {
    return <span className="text-danger">Tidak bisa terhubung ke Supabase: {health.message}</span>;
  }
  return (
    <span>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" aria-hidden />
      Terhubung ke Supabase ({health.latencyMs} ms)
    </span>
  );
}
