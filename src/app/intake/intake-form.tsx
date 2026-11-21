"use client";

import { useActionState, useMemo, useState } from "react";

import {
  buildEnrichedComplaintFromAnswers,
  ComplaintClarifier,
  type ClarifierAnswers,
} from "@/components/ai";
import { CheckIcon } from "@/components/icons";
import type { ClarifyQuestion } from "@/lib/ai/clarify-core";
import { registerRemote, type IntakeState } from "@/lib/intake/actions";

export type DoctorOption = {
  id: string;
  name: string;
  room: string | null;
  prefix: string;
  waiting: number;
  waitMinutes: number;
};

const LABEL = "flex flex-col gap-2 text-sm font-semibold text-ink";
const HELP = "text-[13px] font-normal text-muted";

export function IntakeForm({ doctors }: { doctors: DoctorOption[] }) {
  const [state, formAction, pending] = useActionState<IntakeState, FormData>(registerRemote, {});
  const v = state.values ?? {};
  const [complaintText, setComplaintText] = useState(v.complaint ?? "");
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<ClarifierAnswers>({});

  const enrichedComplaint = useMemo(
    () => buildEnrichedComplaintFromAnswers(complaintText, clarifyQuestions, clarifyAnswers, 500),
    [complaintText, clarifyQuestions, clarifyAnswers],
  );

  function handleQuestionsLoaded(nextQuestions: ClarifyQuestion[]) {
    setClarifyQuestions(nextQuestions);
    setClarifyAnswers({});
  }

  function handleToggleAnswer(question: ClarifyQuestion, option: string) {
    setClarifyAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const exists = current.includes(option);
      let next: string[];
      if (question.allowMultiple) {
        next = exists ? current.filter((item) => item !== option) : [...current, option];
      } else {
        next = exists ? [] : [option];
      }
      return { ...prev, [question.id]: next };
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-7">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-sm font-semibold">Dokter</legend>
        {doctors.map((d, i) => (
          <label
            key={d.id}
            className="group relative flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-[14px] bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)] transition-[box-shadow,background-color] duration-[var(--dur-1)] hover:shadow-[inset_0_0_0_1px_#c9ccec] has-[:checked]:bg-tint has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
          >
            <input
              type="radio"
              name="doctorId"
              value={d.id}
              required
              defaultChecked={v.doctorId ? v.doctorId === d.id : i === 0}
              className="peer sr-only"
            />
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-tint font-mono text-[15px] font-semibold text-accent-strong group-has-[:checked]:bg-accent group-has-[:checked]:text-white">
              {d.prefix}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{d.name}</span>
              <span className="text-[13px] text-muted">{d.room}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end text-right tabular-nums">
              {d.waiting === 0 ? (
                <span className="text-[13px] font-semibold text-ok">Tanpa antre</span>
              ) : (
                <>
                  <span className="text-[13px] font-semibold">±{d.waitMinutes} mnt</span>
                  <span className="text-xs text-muted">{d.waiting} antre</span>
                </>
              )}
            </span>
            <span className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-accent text-white group-has-[:checked]:grid">
              <CheckIcon size={13} strokeWidth={2.5} />
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-5">
        <label className={LABEL}>
          Nama lengkap
          <input name="fullName" required maxLength={80} autoComplete="name" defaultValue={v.fullName} className="field" />
        </label>

        <label className={LABEL}>
          Nomor WhatsApp
          <input
            name="phone"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0812 3456 7890"
            defaultValue={v.phone}
            className="field"
          />
          <span className={HELP}>Kami kabari saat giliran Anda dekat.</span>
        </label>

        <div className="flex flex-col gap-3">
          <label className={LABEL}>
            Keluhan
            <textarea
              required
              rows={3}
              maxLength={380}
              placeholder="Contoh: kepala cenat cenut atau demam sejak kemarin"
              value={complaintText}
              onChange={(e) => setComplaintText(e.target.value)}
              className="field resize-y"
            />
          </label>
          <input type="hidden" name="complaint" value={enrichedComplaint} />

          <ComplaintClarifier
            complaint={complaintText}
            questions={clarifyQuestions}
            answers={clarifyAnswers}
            onQuestionsLoaded={handleQuestionsLoaded}
            onToggleAnswer={handleToggleAnswer}
          />
        </div>

        <label className={LABEL}>
          <span>
            Tanggal lahir <span className="font-normal text-muted">(opsional)</span>
          </span>
          <input name="birthDate" type="date" autoComplete="bday" defaultValue={v.birthDate} className="field" />
        </label>

        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[10px] bg-surface px-4 text-[15px] shadow-[inset_0_0_0_1px_var(--color-line)] has-[:checked]:bg-tint has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-accent)]">
          <input
            type="checkbox"
            name="isFollowUp"
            defaultChecked={v.isFollowUp === "on"}
            className="h-[18px] w-[18px] accent-[var(--color-accent)]"
          />
          Kontrol lanjutan
        </label>
      </div>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm font-medium text-danger shadow-[inset_0_0_0_1px_var(--color-danger-line)]"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
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
            "Ambil nomor antrean"
          )}
        </button>
        <p className="text-center text-xs text-muted">Data Anda hanya untuk antrean klinik ini.</p>
      </div>
    </form>
  );
}
