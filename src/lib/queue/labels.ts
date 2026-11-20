import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];

export const TICKET_STATUS_LABEL: Record<Enums["ticket_status"], string> = {
  waiting: "Menunggu",
  called: "Dipanggil",
  in_consultation: "Diperiksa",
  done: "Selesai",
  cancelled: "Batal",
  no_show: "Tidak hadir",
};

export const TICKET_CHANNEL_LABEL: Record<Enums["ticket_channel"], string> = {
  walk_in: "Datang langsung",
  remote: "Daftar online",
};

// Ticket code shown to patients and staff, e.g. A-007.
export function ticketCode(prefix: string, ticketNumber: number): string {
  return `${prefix}-${String(ticketNumber).padStart(3, "0")}`;
}
