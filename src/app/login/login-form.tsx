"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
          className="field"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Kata sandi
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          className="field"
        />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-primary btn-lg mt-2 w-full">
        {pending ? "Memproses…" : "Masuk"}
      </button>
    </form>
  );
}
