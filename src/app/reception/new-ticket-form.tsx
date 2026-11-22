"use client";

import { useActionState, useMemo, useState } from "react";

import { buildEnrichedComplaintFromAnswers, ComplaintClarifier, type ClarifierAnswers } from "@/components/ai";
import { CheckIcon, PlusIcon } from "@/components/icons";
import type { ClarifyQuestion } from "@/lib/ai/clarify-core";
import { createTicket, type ActionResult } from "@/lib/queue/actions";

const LABEL = "flex flex-col gap-1.5 text-sm font-semibold";

export type ReceptionDoctor = {
  id: string;
  prefix: string;
  name: string;
  room: string | null;
  open: boolean;
  note: string; // "Buka sampai 16.00" / "Tutup · buka Senin 08.00"
};

// Receptionist registers a patient at the desk. The patient still has to be
// marked as arrived ("Tiba") when they are in the waiting room, because a
// patient may register and go home while the queue is long.
export function NewTicketForm({ doctors }: { doctors: ReceptionDoctor[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createTicket, { ok: true });
  const defaultDoctor = (doctors.find((d) => d.open) ?? doctors[0])?.id;

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="text-[17px] font-bold">Pasien baru</h2>

      {/* New ticket -> fresh fields (complaint, clarifier answers). */}
      <Fields key={state.ticket?.code ?? "new"} doctors={doctors} defaultDoctor={defaultDoctor} />

      <button type="submit" disabled={pending} aria-busy={pending} className="btn btn-primary btn-lg w-full">
        {pending ? (
          <>
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
            />
            Membuat tiket…
          </>
        ) : (
          <>
            <PlusIcon size={18} />
            Buat tiket
          </>
        )}
      </button>

      {state.ok && state.ticket ? (
        <div role="status" className="flex flex-col gap-2 rounded-[10px] bg-ok-soft px-3.5 py-3 text-sm">
          <p className="flex items-start gap-2 font-semibold text-ok">
            <CheckIcon size={18} className="mt-px shrink-0" />
            {state.message}
          </p>
          <p className="text-ink">
            Perkiraan periksa <strong className="tabular-nums">±{state.ticket.minutes} menit</strong>. Tekan{" "}
            <strong>Tandai tiba</strong> saat pasien ada di ruang tunggu.
          </p>
          {state.ticket.summary ? (
            <div className="rounded-[10px] bg-surface px-3 py-2.5">
              <p className="text-xs font-semibold text-muted">Ringkasan keluhan</p>
              <p className="mt-0.5 text-ink">{state.ticket.summary}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      {!state.ok && state.error ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Fields({ doctors, defaultDoctor }: { doctors: ReceptionDoctor[]; defaultDoctor?: string }) {
  const [complaint, setComplaint] = useState("");
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<ClarifierAnswers>({});

  const enrichedComplaint = useMemo(
    () => buildEnrichedComplaintFromAnswers(complaint, questions, answers, 500),
    [complaint, questions, answers],
  );

  function handleQuestionsLoaded(next: ClarifyQuestion[]) {
    setQuestions(next);
    setAnswers({});
  }

  function handleToggleAnswer(question: ClarifyQuestion, option: string) {
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const exists = current.includes(option);
      const next = question.allowMultiple
        ? exists
          ? current.filter((o) => o !== option)
          : [...current, option]
        : exists
          ? []
          : [option];
      return { ...prev, [question.id]: next };
    });
  }

  return (
    <>
      <label className={LABEL}>
        Dokter
        <select name="doctorId" required className="field" defaultValue={defaultDoctor}>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.prefix} · {d.name}
              {d.room ? ` (${d.room})` : ""}
              {d.open ? "" : " · tutup"}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL}>
        Nama pasien
        <input name="fullName" required autoComplete="off" className="field" />
      </label>

      <div className="flex flex-col gap-3">
        <label className={LABEL}>
          Keluhan
          <textarea
            required
            rows={2}
            maxLength={380}
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="field resize-y"
          />
        </label>
        <input type="hidden" name="complaint" value={enrichedComplaint} />
        <ComplaintClarifier
          complaint={complaint}
          questions={questions}
          answers={answers}
          onQuestionsLoaded={handleQuestionsLoaded}
          onToggleAnswer={handleToggleAnswer}
        />
      </div>

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
    </>
  );
}
