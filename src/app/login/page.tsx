import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { getDictionary } from "@/lib/i18n/server";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.login };
}

export default async function LoginPage() {
  const t = (await getDictionary()).login;
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex justify-center">
        <Brand />
      </div>
      <div className="card flex flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-[-0.03em]">{t.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.sub}</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
