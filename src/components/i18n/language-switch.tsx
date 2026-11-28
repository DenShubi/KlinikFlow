"use client";

import { useRouter } from "next/navigation";
import { useId, useOptimistic, useTransition } from "react";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, type Locale } from "@/lib/i18n/config";

import { useLocale, useT } from "./provider";

// Floating language switch, bottom left on every page. Stores the choice in a
// cookie and re-renders the page on the server in the new language.
export function LanguageSwitch() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(locale);

  function choose(next: Locale) {
    if (next === shown) return;
    startTransition(() => {
      setShown(next);
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t.lang.label}
      aria-busy={pending || undefined}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 flex gap-0.5 rounded-full bg-surface p-0.5 shadow-[0_4px_16px_rgb(18_32_86/0.14),inset_0_0_0_1px_var(--color-line-soft)] print:hidden"
    >
      {LOCALES.map((l) => {
        const active = l === shown;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            title={t.lang[l]}
            onClick={() => choose(l)}
            className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors duration-[var(--dur-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              active ? "bg-tint text-accent-strong" : "cursor-pointer text-muted hover:text-ink"
            }`}
          >
            <Flag locale={l} />
            <span>{l.toUpperCase()}</span>
            <span className="sr-only">{t.lang[l]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Flag({ locale }: { locale: Locale }) {
  const uid = useId().replace(/:/g, "");
  return (
    <span
      aria-hidden="true"
      className="block h-[14px] w-[21px] shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(18_32_86/0.15)]"
    >
      {locale === "id" ? (
        // Indonesia: red over white.
        <svg viewBox="0 0 3 2" width="21" height="14" preserveAspectRatio="none" className="block">
          <rect width="3" height="2" fill="#fff" />
          <rect width="3" height="1" fill="#ce1126" />
        </svg>
      ) : (
        // United Kingdom (Union Jack).
        <svg viewBox="0 0 60 30" width="21" height="14" preserveAspectRatio="xMidYMid slice" className="block">
          <clipPath id={`${uid}-t`}>
            <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
          </clipPath>
          <rect width="60" height="30" fill="#012169" />
          <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
          <path d="M0 0l60 30m0-30L0 30" clipPath={`url(#${uid}-t)`} stroke="#c8102e" strokeWidth="4" />
          <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
          <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
        </svg>
      )}
    </span>
  );
}
