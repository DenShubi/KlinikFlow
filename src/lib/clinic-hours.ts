import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

// Working hours of a doctor (columns of public.doctors), in clinic time (WIB).
export type DoctorHours = {
  work_days: number[]; // ISO weekdays, 1 = Monday ... 7 = Sunday
  opens_at: string; // "08:00:00"
  closes_at: string; // "16:00:00"
};

export type Availability = {
  open: boolean;
  hours: string; // "08.00–16.00"
  days: string; // "Senin–Jumat"
  note: string; // "Buka sampai 16.00" / "Tutup · buka Senin 08.00"
};

const DAY_NAMES = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function clinicClock(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: WEEKDAY_INDEX[get("weekday")] ?? 1, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// "08:00:00" -> "08.00" (Indonesian time notation)
function formatTime(time: string): string {
  return time.slice(0, 5).replace(":", ".");
}

export function formatWorkDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "–";
  if (sorted.length === 7) return "Setiap hari";
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted.at(-1)!]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

// Demo switch: CLINIC_ALWAYS_OPEN=true treats every doctor as open, so the
// demo works at night and on weekends. Read on the server only.
export function clinicAlwaysOpen(): boolean {
  return process.env.CLINIC_ALWAYS_OPEN === "true";
}

// Is the doctor working right now, and if not, when do they open next?
// Call at request time only (it reads the clock).
export function doctorAvailability(h: DoctorHours, now: Date = new Date()): Availability {
  const hours = `${formatTime(h.opens_at)}–${formatTime(h.closes_at)}`;
  const days = formatWorkDays(h.work_days);
  const opens = formatTime(h.opens_at);

  if (clinicAlwaysOpen()) return { open: true, hours, days, note: `Buka ${hours}` };

  const { weekday, minutes } = clinicClock(now);
  const worksToday = h.work_days.includes(weekday);
  if (worksToday && minutes >= toMinutes(h.opens_at) && minutes < toMinutes(h.closes_at)) {
    return { open: true, hours, days, note: `Buka sampai ${formatTime(h.closes_at)}` };
  }
  if (worksToday && minutes < toMinutes(h.opens_at)) {
    return { open: false, hours, days, note: `Tutup · buka pukul ${opens}` };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = ((weekday - 1 + ahead) % 7) + 1;
    if (h.work_days.includes(day)) {
      return { open: false, hours, days, note: `Tutup · buka ${ahead === 1 ? "besok" : DAY_NAMES[day]} ${opens}` };
    }
  }
  return { open: false, hours, days, note: "Tutup" };
}
