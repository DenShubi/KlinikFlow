"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="min-h-[48px] rounded-[12px] border border-line bg-white px-3.5 py-2.5 text-base font-normal text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Kata sandi
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-[48px] rounded-[12px] border border-line bg-white px-3.5 py-2.5 text-base font-normal text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 min-h-[52px] rounded-full bg-ink px-6 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Memproses…" : "Masuk"}
      </button>
    </form>
  );
}
