"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Status = "connecting" | "live" | "offline";

// Keeps a staff screen in step with the database: when any ticket of the given
// day changes (from this or another window), the page re-renders on the server.
// Realtime applies row-level security, so a doctor only hears about their own queue.
export function LiveRefresh({ serviceDate }: { serviceDate: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const channel = supabase
      .channel(`queue-tickets-${serviceDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_tickets", filter: `service_date=eq.${serviceDate}` },
        () => {
          // One queue operation can update several rows; refresh once.
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 250);
        },
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") setStatus("live");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") setStatus("offline");
      });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [serviceDate, router]);

  const dot = status === "live" ? "bg-emerald-500" : status === "offline" ? "bg-red-500" : "bg-zinc-400";
  const text = status === "live" ? "Langsung" : status === "offline" ? "Terputus, muat ulang halaman" : "Menghubungkan…";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}
