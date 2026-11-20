"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/lib/queue/actions";

const VARIANTS = {
  primary: "bg-ink text-white hover:opacity-90 active:opacity-80",
  secondary: "border border-line bg-white text-ink hover:bg-surface",
  danger: "border border-[#F5B8B8] bg-white text-danger hover:bg-danger-soft",
} as const;

const SIZES = {
  lg: "min-h-[52px] px-6 text-base",
  md: "min-h-[44px] px-5 text-sm",
  sm: "min-h-[32px] px-3 text-xs",
} as const;

// A button that runs one queue Server Action (already bound to its ticket or
// doctor) and shows the error next to it if the queue refuses the change.
export function ActionButton({
  action,
  label,
  pendingLabel = "Memproses…",
  variant = "primary",
  size = "md",
  className = "",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { ok: true });

  return (
    <form action={formAction} className={`inline-flex flex-col items-start gap-1.5 ${className}`.trim()}>
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex w-full items-center justify-center rounded-full font-semibold transition-[opacity,background-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {!state.ok && state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
