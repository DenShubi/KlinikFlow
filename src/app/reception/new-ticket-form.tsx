"use client";

import { useActionState, useEffect, useRef } from "react";

import { CheckIcon, PlusIcon } from "@/components/icons";
import { createTicket, type ActionResult } from "@/lib/queue/actions";

const LABEL = "flex flex-col gap-1.5 text-sm font-semibold";
const SEGMENT =
  "flex min-h-[40px] flex-1 cursor-pointer items-center justify-center rounded-[8px] text-sm font-semibold text-muted transition-colors has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgb(18_32_86/0.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

// Receptionist adds a walk-in (or a phoned-in remote patient) to a queue.
export function NewTicketForm({
  doctors,
}: {
  doctors: { id: string; prefix: string; name: string; room: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createTicket, { ok: true });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="card flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="text-[17px] font-bold">Pasien baru</h2>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="sr-only">Jalur</legend>
        <div className="flex gap-1 rounded-[10px] bg-tint p-1">
          <label className={SEGMENT}>
            <input type="radio" name="channel" value="walk_in" defaultChecked className="sr-only" />
            Datang langsung
          </label>
          <label className={SEGMENT}>
            <input type="radio" name="channel" value="remote" className="sr-only" />
            Online
          </label>
        </div>
      </fieldset>

      <label className={LABEL}>
        Dokter
        <select name="doctorId" required className="field" defaultValue={doctors[0]?.id}>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.prefix} · {d.name}
              {d.room ? ` (${d.room})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL}>
        Nama pasien
        <input name="fullName" required autoComplete="off" className="field" />
      </label>

      <label className={LABEL}>
        Keluhan
        <textarea name="complaint" required rows={2} className="field resize-y" />
      </label>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
        <label className={LABEL}>
          <span>
            WhatsApp <span className="font-normal text-muted">(opsional)</span>
          </span>
          <input name="phone" type="tel" inputMode="tel" placeholder="08xx" className="field" />
        </label>
        <label className={LABEL}>
          <span>
            Tanggal lahir <span className="font-normal text-muted">(opsional)</span>
          </span>
          <input name="birthDate" type="date" className="field" />
        </label>
      </div>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
        <input type="checkbox" name="isFollowUp" className="h-[18px] w-[18px] accent-[var(--color-accent)]" />
        Kontrol lanjutan
      </label>

      <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-primary btn-lg w-full">
        {pending ? (
          "Membuat tiket…"
        ) : (
          <>
            <PlusIcon size={18} />
            Buat tiket
          </>
        )}
      </button>

      {state.ok && state.message ? (
        <p role="status" className="flex items-start gap-2 rounded-[10px] bg-ok-soft px-3.5 py-2.5 text-sm font-medium text-ok">
          <CheckIcon size={18} className="mt-px shrink-0" />
          {state.message}
        </p>
      ) : null}
      {!state.ok && state.error ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
