import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense, type ReactNode } from "react";

import { LanguageSwitch } from "@/components/i18n/language-switch";
import { I18nProvider } from "@/components/i18n/provider";
import { getDictionary, getLocale } from "@/lib/i18n/server";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: "KlinikFlow", description: t.meta.homeDescription };
}

export const viewport: Viewport = {
  themeColor: "#fafafd",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakarta.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* The language comes from a cookie, so it is read per request. */}
        <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
          <LocaleRoot>{children}</LocaleRoot>
        </Suspense>
      </body>
    </html>
  );
}

async function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      {children}
      {/* Room at the end of every page so the floating switch never covers the last line. */}
      <div aria-hidden="true" className="h-16 shrink-0" />
      <LanguageSwitch />
    </I18nProvider>
  );
}
