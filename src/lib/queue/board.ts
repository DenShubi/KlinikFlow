import "server-only";

import { connection } from "next/server";

import { doctorAvailability, type Availability } from "@/lib/clinic-hours";
import { clinicToday, minutesUntil } from "@/lib/clinic-time";
import { ticketCode } from "@/lib/queue/labels";
import { FALLBACK_SLOT_MINUTES } from "@/lib/queue/rules";
import { queueTopic } from "@/lib/queue/public-status";
import { createAdminClient } from "@/lib/supabase/admin";

// Public, non-personal summary of each active doctor's queue today: who is
// being served, how many are waiting, how long a new patient would wait, and
// whether the doctor is working now. Used by the home page and the intake.
export type BoardDoctor = {
  id: string;
  prefix: string;
  name: string;
  specialty: string;
  room: string | null;
  workDays: number[];
  opensAt: string;
  closesAt: string;
  nowServing: string | null; // ticket code with the doctor (or called), e.g. "A-012"
  waiting: number; // waiting patients who still count (not away after a missed turn)
  waitMinutes: number; // estimated wait for someone joining now
  availability: Availability;
  topic: string; // Realtime broadcast topic of this queue
};


export async function getQueueBoard(): Promise<BoardDoctor[]> {
  await connection(); // live data and the clock: per request
  const admin = createAdminClient();
  const today = clinicToday();

  const [{ data: doctors }, { data: tickets }] = await Promise.all([
    admin
      .from("doctors")
      .select("id, full_name, specialty, room, ticket_prefix, work_days, opens_at, closes_at")
      .eq("is_active", true)
      .order("ticket_prefix"),
    admin
      .from("queue_tickets")
      .select("doctor_id, ticket_number, status, estimated_call_at, predicted_minutes, checked_in_at, missed_turn_at, called_at")
      .eq("service_date", today)
      .in("status", ["waiting", "called", "in_consultation"]),
  ]);

  return (doctors ?? []).map((d) => {
    const queue = tickets?.filter((t) => t.doctor_id === d.id) ?? [];
    const serving =
      queue.find((t) => t.status === "in_consultation") ??
      queue.filter((t) => t.status === "called").sort((a, b) => (b.called_at ?? "").localeCompare(a.called_at ?? ""))[0];
    const waiting = queue.filter((t) => t.status === "waiting" && !(t.missed_turn_at && !t.checked_in_at));
    // When the last waiting patient is expected to finish.
    const lastEnd = waiting
      .map((t) => (t.estimated_call_at ? Date.parse(t.estimated_call_at) + (t.predicted_minutes ?? FALLBACK_SLOT_MINUTES) * 60000 : 0))
      .reduce((a, b) => Math.max(a, b), 0);

    return {
      id: d.id,
      prefix: d.ticket_prefix,
      name: d.full_name,
      specialty: d.specialty,
      room: d.room,
      workDays: d.work_days,
      opensAt: d.opens_at,
      closesAt: d.closes_at,
      nowServing: serving ? ticketCode(d.ticket_prefix, serving.ticket_number) : null,
      waiting: waiting.length,
      waitMinutes: lastEnd ? (minutesUntil(new Date(lastEnd).toISOString()) ?? 0) : 0,
      availability: doctorAvailability(d),
      topic: queueTopic(d.id, today),
    };
  });
}
