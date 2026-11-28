"use client";

import { useT } from "@/components/i18n/provider";

const BAR = "animate-pulse rounded-[10px] bg-tint motion-reduce:animate-none";

// Staff screens: header bar + content blocks.
export function PageLoading() {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <div className="h-16 border-b border-line-soft bg-surface" />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className={`h-8 w-56 ${BAR}`} />
        <div className={`h-24 w-full ${BAR}`} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className={`h-72 ${BAR}`} />
          <div className={`h-72 ${BAR}`} />
        </div>
        <p className="sr-only">{t.common.loading}</p>
      </main>
    </div>
  );
}

// Patient screens: one ticket-sized block.
export function TicketLoading() {
  const t = useT();
  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center gap-5 px-4 py-6" aria-busy="true">
      <div className={`h-11 w-36 ${BAR}`} />
      <div className={`h-[460px] w-full rounded-[20px] ${BAR}`} />
      <p className="sr-only">{t.common.loading}</p>
    </main>
  );
}
