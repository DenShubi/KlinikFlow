// The clinic runs on Western Indonesia Time (WIB). Same rule as the database
// function public.clinic_today().
export const CLINIC_TIME_ZONE = "Asia/Jakarta";

// Today's date in the clinic, as YYYY-MM-DD (matches queue_tickets.service_date).
export function clinicToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(now);
}

// Minutes from now until an estimated time, for "about N minutes" labels.
// Call only at request time (after connection() or a session check).
export function minutesUntil(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null;
  return Math.max(0, Math.round((new Date(value).getTime() - now) / 60000));
}

// "09.41" style time in the clinic time zone.
export function formatClinicTime(value: string | null | undefined): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
