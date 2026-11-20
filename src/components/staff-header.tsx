import { signOut } from "@/lib/auth/actions";
import type { Staff } from "@/lib/auth/dal";
import { ROLE_LABEL } from "@/lib/auth/roles";

export function StaffHeader({ staff, title }: { staff: Staff; title: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <div>
        <p className="text-sm text-zinc-500">KlinikFlow · {ROLE_LABEL[staff.role]}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">{staff.fullName}</span>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}
