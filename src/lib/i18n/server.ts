import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { DICTIONARIES, type Dictionary } from "./dictionaries";

// The visitor's language, from the cookie set by the language switch.
// Reads cookies, so call it inside a Suspense boundary or a request-time path.
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export async function getDictionary(): Promise<Dictionary> {
  return DICTIONARIES[await getLocale()];
}
