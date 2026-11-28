import { CLINIC_TIME_ZONE, clinicToday } from "@/lib/clinic-time";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";

// Working hours of a doctor (columns of public.doctors), in clinic time (WIB).
export type DoctorHours = {
  work_days: number[]; // ISO weekdays, 1 = Monday ... 7 = Sunday
  opens_at: string; // "08:00:00"
  closes_at: string; // "16:00:00"
};

export type ServiceDateOption = {
  date: string; // YYYY-MM-DD
  label: string; // "Hari ini", "Besok", "Sen, 23 Nov"
  sublabel: string; // "22 Nov" or "08.00 WIB"
  isToday: boolean;
};

export type Availability = {
  open: boolean;
  hours: string; // "08.00–16.00"
  days: string; // "Senin–Jumat"
  note: string; // "Buka sampai 16.00" / "Tutup · buka Senin 08.00"
  next: string; // when closed: "buka Senin 08.00"; empty when open
};

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

// "08:00:00" -> "08.00" in Indonesian, "08:00" in English.
function formatTime(time: string, locale: Locale): string {
  const hhmm = time.slice(0, 5);
  return locale === "id" ? hhmm.replace(":", ".") : hhmm;
}

export function formatWorkDays(days: number[], locale: Locale = "id"): string {
  const t = DICTIONARIES[locale].hours;
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "–";
  if (sorted.length === 7) return t.everyDay;
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length > 2) return `${t.dayNames[sorted[0]]}–${t.dayNames[sorted.at(-1)!]}`;
  return sorted.map((d) => t.dayNames[d]).join(", ");
}

// Demo switch: CLINIC_ALWAYS_OPEN=true treats every doctor as open, so the
// demo works at night and on weekends. Read on the server only.
export function clinicAlwaysOpen(): boolean {
  return process.env.CLINIC_ALWAYS_OPEN === "true";
}

// Is the doctor working right now, and if not, when do they open next?
// Call at request time only (it reads the clock).
export function doctorAvailability(h: DoctorHours, locale: Locale = "id", now: Date = new Date()): Availability {
  const t = DICTIONARIES[locale].hours;
  const hours = `${formatTime(h.opens_at, locale)}–${formatTime(h.closes_at, locale)}`;
  const days = formatWorkDays(h.work_days, locale);
  const opens = formatTime(h.opens_at, locale);
  const closed = (next: string) => ({ open: false, hours, days, note: next ? `${t.closed} · ${next}` : t.closed, next });

  if (clinicAlwaysOpen()) return { open: true, hours, days, note: t.open(hours), next: "" };

  const { weekday, minutes } = clinicClock(now);
  const worksToday = h.work_days.includes(weekday);
  if (worksToday && minutes >= toMinutes(h.opens_at) && minutes < toMinutes(h.closes_at)) {
    return { open: true, hours, days, note: t.openUntil(formatTime(h.closes_at, locale)), next: "" };
  }
  if (worksToday && minutes < toMinutes(h.opens_at)) {
    return closed(t.opensAt(opens));
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = ((weekday - 1 + ahead) % 7) + 1;
    if (h.work_days.includes(day)) {
      return closed(ahead === 1 ? t.opensTomorrow(opens) : t.opensOn(t.dayNames[day], opens));
    }
  }
  return closed("");
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

function shortDayMonth(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function shortWeekdayDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

// Build upcoming valid working dates for a doctor (up to `count` dates within 14 days).
export function upcomingServiceDates(
  h: DoctorHours,
  locale: Locale = "id",
  count = 6,
  now: Date = new Date(),
): ServiceDateOption[] {
  const t = DICTIONARIES[locale].hours;
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
        label: t.today,
        sublabel: shortDayMonth(date, locale),
        isToday: true,
      });
      continue;
    }

    if (!h.work_days.includes(weekday)) continue;
    options.push({
      date,
      label: offset === 1 ? t.tomorrow : shortWeekdayDate(date, locale),
      sublabel: offset === 1 ? shortDayMonth(date, locale) : `${formatTime(h.opens_at, locale)} ${t.timeZone}`,
      isToday: false,
    });
  }

  return options;
}

export function isDoctorWorkingOnDate(
  h: DoctorHours,
  serviceDate: string,
  locale: Locale = "id",
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  const t = DICTIONARIES[locale].hours;
  if (!ISO_DATE.test(serviceDate)) {
    return { ok: false, reason: t.invalidDate };
  }

  const today = clinicToday(now);
  if (serviceDate < today) {
    return { ok: false, reason: t.pastDate };
  }

  const maxDate = addDaysIso(today, MAX_BOOKING_DAYS_AHEAD);
  if (serviceDate > maxDate) {
    return { ok: false, reason: t.tooFar };
  }

  const alwaysOpen = clinicAlwaysOpen();
  const weekday = isoWeekdayOfDate(serviceDate);

  if (serviceDate === today) {
    if (alwaysOpen) return { ok: true };
    const { minutes } = clinicClock(now);
    if (!h.work_days.includes(weekday)) {
      return { ok: false, reason: t.notToday };
    }
    if (minutes >= toMinutes(h.closes_at)) {
      return { ok: false, reason: t.endedToday };
    }
    return { ok: true };
  }

  if (!h.work_days.includes(weekday)) {
    return { ok: false, reason: t.worksOn(formatWorkDays(h.work_days, locale)) };
  }

  return { ok: true };
}

// Returns UTC epoch ms for the doctor's closing time on a given YYYY-MM-DD (WIB = UTC+7).
export function clinicCloseTimestampMs(serviceDate: string, closesAt: string): number {
  const hhmmss = closesAt.length === 5 ? `${closesAt}:00` : closesAt.slice(0, 8);
  return Date.parse(`${serviceDate}T${hhmmss}+07:00`);
}

export function formatOpeningTime(opensAt: string, locale: Locale = "id"): string {
  return formatTime(opensAt, locale);
}
