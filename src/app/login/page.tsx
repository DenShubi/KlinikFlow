import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Masuk staf · KlinikFlow",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-sm font-medium text-brand-strong">
          KlinikFlow
        </Link>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Masuk staf</h1>
        <p className="text-sm text-muted">
          Untuk resepsionis dan dokter. Pasien tidak perlu masuk.
        </p>
      </header>
      <LoginForm />
    </main>
  );
}
