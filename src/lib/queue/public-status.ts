import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

// Shape returned by the database function public.ticket_public_status.
export type TicketPublicStatus = {
  ticket_id: string;
  ticket_code: string;
  doctor_id: string;
  doctor_name: string;
  room: string | null;
  service_date: string;
  status: Enums["ticket_status"];
  channel: Enums["ticket_channel"];
  checked_in: boolean;
  defer_count: number;
  patient_short_name: string;
  predicted_minutes: number | null;
  prediction_source: Enums["prediction_source"] | null;
  estimated_call_at: string | null;
  people_ahead: number;
  now_serving: string | null;
};

// Realtime topic the database broadcasts on when this queue changes.
export function queueTopic(doctorId: string, serviceDate: string): string {
  return `queue:${doctorId}:${serviceDate}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
