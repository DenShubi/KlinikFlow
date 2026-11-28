"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { DICTIONARIES, type Dictionary } from "@/lib/i18n/dictionaries";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

// Gives client components the language the server rendered with, so the
// browser renders the same text (no hydration mismatch).
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // <html lang> is rendered by the root layout before the cookie is read.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Dictionary {
  return DICTIONARIES[useContext(LocaleContext)];
}
