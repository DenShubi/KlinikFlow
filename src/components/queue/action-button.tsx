"use client";

import { useActionState } from "react";

import { useT } from "@/components/i18n/provider";
import type { ActionResult } from "@/lib/queue/actions";

const VARIANTS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  onAccent: "btn-on-accent",
} as const;

const SIZES = {
  lg: "btn-lg",
  md: "",
  sm: "btn-sm",
} as const;

// A button that runs one queue Server Action (already bound to its ticket or
// doctor) and shows the error next to it if the queue refuses the change.
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState<ActionResult>(() => action(), { ok: true });

  return (
    <form action={formAction} className={`inline-flex flex-col items-stretch gap-1.5 ${className}`.trim()}>
      <button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
        className={`btn w-full ${VARIANTS[variant]} ${SIZES[size]}`}
      >
        {pending ? (pendingLabel ?? t.common.processing) : label}
      </button>
      {!state.ok && state.error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
