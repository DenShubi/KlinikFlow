import type { ReactNode } from "react";

import { signOut } from "@/lib/auth/actions";
import type { Staff } from "@/lib/auth/dal";
import { ROLE_LABEL } from "@/lib/auth/roles";

export function StaffHeader({ staff, title, aside }: { staff: Staff; title: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          <span className="font-medium text-brand-strong">KlinikFlow</span> · {ROLE_LABEL[staff.role]}
        </p>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {aside}
        <span className="text-muted">{staff.fullName}</span>
        <form action={signOut}>
          <button
            type="submit"
            className="min-h-[36px] rounded-full border border-line bg-white px-4 font-medium hover:bg-surface"
          >
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
