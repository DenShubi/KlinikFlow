import { CLINIC_TIME_ZONE, clinicToday } from "@/lib/clinic-time";

// Working hours of a doctor (columns of public.doctors), in clinic time (WIB).
export type DoctorHours = {
  work_days: number[]; // ISO weekdays, 1 = Monday ... 7 = Sunday
  opens_at: string; // "08:00:00"
  closes_at: string; // "16:00:00"
};

export type ServiceDateOption = {
  date: string; // YYYY-MM-DD
  label: string; // "Hari ini", "Besok", "Sen, 23 Nov"
  sublabel: string; // "22 Nov" or "08.00-16.00"
  isToday: boolean;
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BOOKING_DAYS_AHEAD = 14;

function addDaysIso(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isoWeekdayOfDate(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return day === 0 ? 7 : day;
}

function shortDayMonth(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function shortWeekdayDate(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

// Build upcoming valid working dates for a doctor (up to `count` dates within 14 days).
export function upcomingServiceDates(
  h: DoctorHours,
  count = 6,
  now: Date = new Date(),
): ServiceDateOption[] {
  const today = clinicToday(now);
  const { minutes } = clinicClock(now);
  const alwaysOpen = clinicAlwaysOpen();
  const options: ServiceDateOption[] = [];

  for (let offset = 0; offset <= MAX_BOOKING_DAYS_AHEAD && options.length < count; offset += 1) {
    const date = addDaysIso(today, offset);
    const weekday = isoWeekdayOfDate(date);
    const isToday = offset === 0;

    if (isToday) {
      const canBookToday =
        alwaysOpen || (h.work_days.includes(weekday) && minutes < toMinutes(h.closes_at));
      if (!canBookToday) continue;
      options.push({
        date,
        label: "Hari ini",
        sublabel: shortDayMonth(date),
        isToday: true,
      });
      continue;
    }

    if (!h.work_days.includes(weekday)) continue;
    options.push({
      date,
      label: offset === 1 ? "Besok" : shortWeekdayDate(date),
      sublabel: offset === 1 ? shortDayMonth(date) : `${formatTime(h.opens_at)} WIB`,
      isToday: false,
    });
  }

  return options;
}

export function isDoctorWorkingOnDate(
  h: DoctorHours,
  serviceDate: string,
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  if (!ISO_DATE.test(serviceDate)) {
    return { ok: false, reason: "Tanggal kunjungan tidak valid." };
  }

  const today = clinicToday(now);
  if (serviceDate < today) {
    return { ok: false, reason: "Tanggal kunjungan tidak boleh di masa lalu." };
  }

  const maxDate = addDaysIso(today, MAX_BOOKING_DAYS_AHEAD);
  if (serviceDate > maxDate) {
    return { ok: false, reason: "Pendaftaran maksimal 14 hari ke depan." };
  }

  const alwaysOpen = clinicAlwaysOpen();
  const weekday = isoWeekdayOfDate(serviceDate);

  if (serviceDate === today) {
    if (alwaysOpen) return { ok: true };
    const { minutes } = clinicClock(now);
    if (!h.work_days.includes(weekday)) {
      return { ok: false, reason: "Dokter tidak praktik hari ini. Pilih tanggal praktik berikutnya." };
    }
    if (minutes >= toMinutes(h.closes_at)) {
      return { ok: false, reason: "Jam praktik hari ini sudah selesai. Pilih tanggal besok atau berikutnya." };
    }
    return { ok: true };
  }

  if (!h.work_days.includes(weekday)) {
    return { ok: false, reason: `Dokter praktik pada ${formatWorkDays(h.work_days)}.` };
  }

  return { ok: true };
}

// Returns UTC epoch ms for the doctor's closing time on a given YYYY-MM-DD (WIB = UTC+7).
export function clinicCloseTimestampMs(serviceDate: string, closesAt: string): number {
  const hhmmss = closesAt.length === 5 ? `${closesAt}:00` : closesAt.slice(0, 8);
  return Date.parse(`${serviceDate}T${hhmmss}+07:00`);
}

export function formatOpeningTime(opensAt: string): string {
  return formatTime(opensAt);
}
