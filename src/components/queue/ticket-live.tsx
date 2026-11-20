"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const POLL_MS = 30_000;

// Keeps a patient's ticket page current without a login: listens to the
// public broadcast for this queue (no personal data in it) and re-renders the
// page from the server. Also refreshes every 30 s so "minutes left" stays
// right and a missed message is caught up.
export function TicketLive({ topic }: { topic: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "queue_changed" }, refresh)
      .subscribe((state) => setLive(state === "SUBSCRIBED"));
    const poll = setInterval(() => router.refresh(), POLL_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [topic, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-faint"}`} aria-hidden />
      {live ? "Diperbarui otomatis" : "Menghubungkan…"}
    </span>
  );
}
