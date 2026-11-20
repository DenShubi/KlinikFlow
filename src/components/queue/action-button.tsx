"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/lib/queue/actions";

const VARIANTS = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  secondary:
    "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950",
} as const;

const SIZES = {
  md: "px-4 py-2.5 text-sm",
  sm: "px-2.5 py-1 text-xs",
} as const;

// A button that runs one queue Server Action (already bound to its ticket or
// doctor) and shows the error next to it if the queue refuses the change.
export function ActionButton({
  action,
  label,
  pendingLabel = "Memproses…",
  variant = "primary",
  size = "md",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { ok: true });

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md font-semibold transition-colors disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {!state.ok && state.error ? (
        <span role="alert" className="text-xs text-red-700 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
