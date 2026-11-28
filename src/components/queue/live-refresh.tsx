"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useT } from "@/components/i18n/provider";
import { createClient } from "@/lib/supabase/client";

type Status = "connecting" | "live" | "offline";

// Keeps a staff screen in step with the database: when any ticket of the given
// day changes (from this or another window), the page re-renders on the server.
// Realtime applies row-level security, so a doctor only hears about their own queue.
// Visible only when the connection drops, since that is when staff must act.
export function LiveRefresh({ serviceDate }: { serviceDate: string }) {
  const t = useT();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A removed channel still reports CLOSED; ignore anything after cleanup.
    let active = true;

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
        if (!active) return;
        if (state === "SUBSCRIBED") setStatus("live");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") setStatus("offline");
      });

    return () => {
      active = false;
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [serviceDate, router]);

  if (status !== "offline") return <span className="sr-only" aria-live="polite" />;

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      aria-live="polite"
      className="btn btn-sm bg-warn-soft text-warn hover:brightness-95"
    >
      {t.staff.notUpdating}
    </button>
  );
}
