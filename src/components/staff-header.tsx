import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { LogOutIcon } from "@/components/icons";
import { signOut } from "@/lib/auth/actions";
import type { Staff } from "@/lib/auth/dal";
import { getDictionary } from "@/lib/i18n/server";

// Full-width bar on staff screens: brand, who is signed in, sign out.
export async function StaffHeader({ staff, href }: { staff: Staff; href: string }) {
  const t = (await getDictionary()).staff;
  const initials = staff.fullName
    .replace(/^(dr|drg)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-10 border-b border-line-soft bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Brand href={href} />
          <span className="hidden rounded-full bg-tint px-2.5 py-1 text-xs font-semibold text-accent-strong sm:inline">
            {t.roles[staff.role]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2.5 sm:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="text-sm font-medium">{staff.fullName}</span>
          </span>
          <form action={signOut}>
            <button type="submit" className="btn btn-quiet btn-sm min-h-[40px]">
              <LogOutIcon size={16} />
              {t.signOut}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

// Page title row under the header.
export function PageTitle({ title, sub, aside }: { title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.035em]">{title}</h1>
        {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
      </div>
      {aside}
    </div>
  );
}
