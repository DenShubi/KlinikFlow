import { connection } from "next/server";
import { Suspense } from "react";

import { checkSupabaseHealth } from "@/lib/supabase/health";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">KlinikFlow</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Hybrid clinic queue: walk-in and remote patients in one line.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Setup status
        </h2>
        <Suspense fallback={<p className="text-zinc-500">Checking Supabase…</p>}>
          <SupabaseStatus />
        </Suspense>
      </section>
    </main>
  );
}

async function SupabaseStatus() {
  await connection(); // check on every request, not once at build time
  const health = await checkSupabaseHealth();

  if (health.status === "not_configured") {
    return (
      <p className="text-amber-700 dark:text-amber-400">
        Supabase is not configured. Copy <code>.env.example</code> to <code>.env.local</code>{" "}
        and fill in the Supabase URL and publishable key, then restart <code>npm run dev</code>.
      </p>
    );
  }

  if (health.status === "error") {
    return (
      <p className="text-red-700 dark:text-red-400">
        Cannot reach Supabase at <code>{health.url}</code>: {health.message}
      </p>
    );
  }

  return (
    <p className="text-emerald-700 dark:text-emerald-400">
      Connected to Supabase at <code>{health.url}</code>
      {health.authVersion ? ` (Auth ${health.authVersion})` : ""} in {health.latencyMs} ms.
    </p>
  );
}
