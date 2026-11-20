"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

const POLL_MS = 30_000;

// Keeps a patient's ticket page current without a login: listens to the
// public broadcast for this queue (no personal data in it) and re-renders the
// page from the server. Also refreshes every 30 s so "minutes left" stays
// right and a missed message is caught up. Renders nothing: the patient only
// needs to see their ticket change.
export function TicketLive({ topic }: { topic: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase.channel(topic).on("broadcast", { event: "queue_changed" }, refresh).subscribe();
    const poll = setInterval(() => router.refresh(), POLL_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [topic, router]);

  return null;
}
