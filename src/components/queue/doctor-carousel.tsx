"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ClockIcon } from "@/components/icons";
import { PrintLabel, Ticket } from "@/components/ticket";
import { createClient } from "@/lib/supabase/client";
import type { BoardDoctor } from "@/lib/queue/board";

const POLL_MS = 60_000;

// Home-page visual: one live ticket per doctor showing the queue right now.
// Swipe (or use the dots) to see the next doctor.
export function DoctorCarousel({ doctors }: { doctors: BoardDoctor[] }) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
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

  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(doctors.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={trackRef}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Antrean tiap dokter saat ini"
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[20px] outline-offset-4 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-scrollbar]:hidden"
      >
        {doctors.map((d, i) => (
          <div
            key={d.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} dari ${doctors.length}: ${d.name}`}
            className="w-full shrink-0 snap-center px-3 py-4"
          >
            <DoctorTicket d={d} />
          </div>
        ))}
      </div>

      {doctors.length > 1 ? (
        <div className="flex justify-center gap-1.5" aria-label="Pilih dokter">
          {doctors.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Dokter ${d.prefix}: ${d.name}`}
              aria-current={i === index ? "true" : undefined}
              className="grid h-6 min-w-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                className={`block h-2 rounded-full transition-[width,background-color] duration-[var(--dur-2)] motion-reduce:transition-none ${
                  i === index ? "w-6 bg-accent" : "w-2 bg-line"
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
  const open = d.availability.open;
  return (
    <Ticket
      label={`Antrean ${d.name}`}
      stub={
        <div className="flex flex-col gap-4 px-6 pb-6 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted">Menunggu</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em]">{d.waiting} orang</p>
            </div>
            <div>
              <p className="text-xs text-muted">Antre sekarang</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-[-0.02em]">
                {!open ? "–" : d.waiting === 0 ? "Langsung" : `±${d.waitMinutes} mnt`}
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
          <PrintLabel>Sedang dilayani</PrintLabel>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${open ? "bg-ok-soft text-ok" : "bg-line-soft text-muted"}`}
          >
            {open ? "Buka" : "Tutup"}
          </span>
        </div>
        <p
          className={`text-[84px] font-extrabold leading-[0.9] tracking-[-0.05em] tabular-nums ${d.nowServing ? "" : "text-line"}`}
        >
          {d.nowServing ?? `${d.prefix}-000`}
        </p>
        <div className="flex justify-between gap-3 text-sm">
          <span className="truncate font-semibold">{d.name}</span>
          <span className="shrink-0 text-muted">{d.room}</span>
        </div>
      </div>
    </Ticket>
  );
}
