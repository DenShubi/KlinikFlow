"use client";

import { useActionState, useEffect, useRef } from "react";

import { createTicket, type ActionResult } from "@/lib/queue/actions";

const INPUT =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

// Minimal intake form to put a patient in a queue. The full receptionist
// screen (one-click walk-in) replaces this later.
export function NewTicketForm({ doctors }: { doctors: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createTicket, { ok: true });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 dark:border-zinc-800"
    >
      <h2 className="text-lg font-semibold sm:col-span-2">Tambah pasien ke antrean</h2>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Dokter
        <select name="doctorId" required className={INPUT} defaultValue={doctors[0]?.id}>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1 text-sm font-medium">
        <legend className="mb-1">Jalur</legend>
        <div className="flex gap-4 py-2 font-normal">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="channel" value="walk_in" defaultChecked /> Datang langsung
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="channel" value="remote" /> Daftar online
          </label>
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama pasien
        <input name="fullName" required className={INPUT} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        WhatsApp (opsional)
        <input name="phone" inputMode="tel" placeholder="08xx xxxx xxxx" className={INPUT} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Tanggal lahir (opsional)
        <input name="birthDate" type="date" className={INPUT} />
      </label>

      <label className="flex items-center gap-2 self-end py-2 text-sm">
        <input type="checkbox" name="isFollowUp" /> Kunjungan kontrol
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
        Keluhan
        <textarea name="complaint" required rows={2} className={INPUT} />
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Menyimpan…" : "Buat tiket"}
        </button>
        {state.ok && state.message ? (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</span>
        ) : null}
        {!state.ok && state.error ? (
          <span role="alert" className="text-sm text-red-700 dark:text-red-400">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
