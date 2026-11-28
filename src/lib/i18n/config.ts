// Languages of the interface. The choice lives in a cookie (no locale in the
// URL), so ticket links stay the same whichever language the patient uses.
export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Locale for Intl date and time formatting.
export const INTL_LOCALE: Record<Locale, string> = {
  id: "id-ID",
  en: "en-GB",
};
