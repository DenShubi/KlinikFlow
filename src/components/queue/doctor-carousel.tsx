"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useT } from "@/components/i18n/provider";
import { ClockIcon } from "@/components/icons";
import { PrintLabel, Ticket } from "@/components/ticket";
import { createClient } from "@/lib/supabase/client";
import type { BoardDoctor } from "@/lib/queue/board";

const POLL_MS = 60_000;

// Home-page visual: one live ticket per doctor showing the queue right now,
// tilted like a ticket lying on the desk. Tickets are stacked and cross-fade
// (an opacity fade, kept even with reduced motion: nothing moves);
// swipe, the arrow keys or the dots switch doctors.
export function DoctorCarousel({ doctors }: { doctors: BoardDoctor[] }) {
  const t = useT().board;
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const topics = doctors.map((d) => d.topic).join("|");

  // Stay current: refresh when any of these queues changes (public broadcast,
  // no personal data), and once a minute for the "minutes" figures.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    const channels = topics
      .split("|")
      .filter(Boolean)
      .map((topic) => supabase.channel(topic).on("broadcast", { event: "queue_changed" }, refresh).subscribe());
    const poll = setInterval(() => router.refresh(), POLL_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [topics, router]);

  const count = doctors.length;
  const current = Math.min(index, count - 1);
  const step = (delta: number) => setIndex((i) => (i + delta + count) % count);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={t.regionLabel}
        onKeyDown={onKeyDown}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
        className="grid rounded-[20px] outline-offset-8 focus-visible:outline-2 focus-visible:outline-accent lg:rotate-[2deg]"
      >
        {doctors.map((d, i) => (
          <div
            key={d.id}
            role="group"
            aria-roledescription="slide"
            aria-label={t.slideLabel(i + 1, count, d.name)}
            aria-hidden={i !== current}
            inert={i !== current}
            className={`fade-safe [grid-area:1/1] transition-opacity duration-[var(--dur-3)] ease-[var(--ease-out)] ${
              i === current ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <DoctorTicket d={d} />
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-label={t.dotsLabel}>
          {doctors.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t.dotLabel(d.prefix, d.name)}
              aria-current={i === current ? "true" : undefined}
              className="grid h-6 min-w-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                className={`block h-2 rounded-full transition-[width,background-color] duration-[var(--dur-2)] motion-reduce:transition-none ${
                  i === current ? "w-6 bg-accent" : "w-2 bg-line"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DoctorTicket({ d }: { d: BoardDoctor }) {
  const dict = useT();
  const t = dict.board;
  const open = d.availability.open;
  return (
    <Ticket
      label={t.ticketLabel(d.name)}
      stub={
        <div className="flex flex-col gap-4 px-6 pb-6 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted">{t.waiting}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em]">{dict.ticket.people(d.waiting)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t.waitNow}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em]">
                {!open ? "–" : d.waiting === 0 ? t.noWait : dict.common.min(d.waitMinutes)}
              </p>
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-[10px] bg-tint px-3 py-2.5 text-sm font-medium text-ink">
            <ClockIcon size={16} className="shrink-0 text-accent" />
            <span>
              {d.availability.days} · {d.availability.hours}
              <span className="block text-xs font-normal text-muted">{d.availability.note}</span>
            </span>
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-5 px-6 pb-7 pt-6">
        <div className="flex items-center justify-between">
          <PrintLabel>{t.nowServing}</PrintLabel>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${open ? "bg-ok-soft text-ok" : "bg-line-soft text-muted"}`}
          >
            {open ? t.open : t.closed}
          </span>
        </div>
        <p
          className={`text-[84px] font-extrabold leading-[0.9] tracking-[-0.05em] tabular-nums ${d.nowServing ? "" : "text-line"}`}
        >
          {d.nowServing ?? `${d.prefix}-000`}
        </p>
        <div className="flex items-start justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-semibold">{d.name}</p>
            <p className="truncate text-xs text-muted">{d.specialty}</p>
          </div>
          <span className="shrink-0 text-muted">{d.room}</span>
        </div>
      </div>
    </Ticket>
  );
}
