"use client";

import { useActionState, useMemo, useState } from "react";

import {
  buildEnrichedComplaintFromAnswers,
  ComplaintClarifier,
  type ClarifierAnswers,
} from "@/components/ai";
import { useT } from "@/components/i18n/provider";
import { CheckIcon } from "@/components/icons";
import { VisitFields } from "@/components/visit-fields";
import type { ClarifyQuestion } from "@/lib/ai/clarify-core";
import type { ServiceDateOption } from "@/lib/clinic-hours";
import { registerRemote, type IntakeState } from "@/lib/intake/actions";

export type DoctorOption = {
  id: string;
  name: string;
  specialty: string;
  room: string | null;
  prefix: string;
  waiting: number;
  waitMinutes: number;
  open: boolean;
  hours: string; // "Senin–Jumat · 08.00–16.00"
  next: string; // when closed: "buka Senin 08.00"
  opensLabel: string; // "08.00"
  dates: ServiceDateOption[];
};

const LABEL = "flex flex-col gap-2 text-sm font-semibold text-ink";
const HELP = "text-[13px] font-normal text-muted";

export function IntakeForm({ doctors }: { doctors: DoctorOption[] }) {
  const dict = useT();
  const t = dict.intake;
  const tc = dict.common;
  const [state, formAction, pending] = useActionState<IntakeState, FormData>(registerRemote, {});
  const v = state.values ?? {};
  const defaultDoctorId =
    (v.doctorId && doctors.some((d) => d.id === v.doctorId) ? v.doctorId : undefined) ??
    doctors.find((d) => d.open && d.dates.length > 0)?.id ??
    doctors.find((d) => d.dates.length > 0)?.id ??
    doctors[0]?.id ??
    "";

  const [selectedDoctorId, setSelectedDoctorId] = useState(defaultDoctorId);
  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0],
    [doctors, selectedDoctorId],
  );

  const [pickedDate, setPickedDate] = useState(v.serviceDate ?? "");
  const availableDates = useMemo(() => selectedDoctor?.dates ?? [], [selectedDoctor]);
  const selectedDate = useMemo(() => {
    if (availableDates.some((d) => d.date === pickedDate)) {
      return pickedDate;
    }
    return availableDates[0]?.date ?? "";
  }, [availableDates, pickedDate]);

  const activeDateOption = useMemo(
    () => availableDates.find((d) => d.date === selectedDate) ?? availableDates[0],
    [availableDates, selectedDate],
  );

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
      <fieldset className="flex min-w-0 flex-col gap-2.5">
        <legend className="mb-2.5 text-sm font-semibold">{t.doctor}</legend>
        {doctors.map((d) => {
          const bookable = d.dates.length > 0;
          return (
            <label
              key={d.id}
              aria-disabled={!bookable || undefined}
              className="group relative flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-[14px] bg-surface px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)] transition-[box-shadow,background-color] duration-[var(--dur-1)] hover:shadow-[inset_0_0_0_1px_#c9ccec] has-[:checked]:bg-tint has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <input
                type="radio"
                name="doctorId"
                value={d.id}
                required
                disabled={!bookable}
                checked={selectedDoctorId === d.id}
                onChange={() => setSelectedDoctorId(d.id)}
                className="peer sr-only"
              />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-tint font-mono text-[15px] font-semibold text-accent-strong group-has-[:checked]:bg-accent group-has-[:checked]:text-white">
                {d.prefix}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{d.name}</span>
                <span className="truncate text-[13px] text-muted">
                  {d.specialty}
                  {d.room ? ` · ${d.room}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end text-right tabular-nums">
                {!d.open ? (
                  <>
                    <span className="text-[13px] font-semibold text-muted">{t.nextOpening}</span>
                    <span className="text-xs text-muted">{d.next}</span>
                  </>
                ) : d.waiting === 0 ? (
                  <span className="text-[13px] font-semibold text-ok">{t.noQueue}</span>
                ) : (
                  <>
                    <span className="text-[13px] font-semibold">{tc.min(d.waitMinutes)}</span>
                    <span className="text-xs text-muted">{t.waitingCount(d.waiting)}</span>
                  </>
                )}
              </span>
              <span className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-accent text-white group-has-[:checked]:grid">
                <CheckIcon size={13} strokeWidth={2.5} />
              </span>
            </label>
          );
        })}
      </fieldset>

      {availableDates.length > 0 ? (
        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="mb-2 text-sm font-semibold">{t.visitDate}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {availableDates.map((option) => (
              <label
                key={option.date}
                className="group relative flex min-h-[54px] cursor-pointer flex-col justify-center rounded-[12px] bg-surface px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-[box-shadow,background-color] duration-[var(--dur-1)] hover:shadow-[inset_0_0_0_1px_#c9ccec] has-[:checked]:bg-tint has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="radio"
                  name="serviceDate"
                  value={option.date}
                  required
                  checked={selectedDate === option.date}
                  onChange={() => setPickedDate(option.date)}
                  className="peer sr-only"
                />
                <span className="text-xs font-semibold text-ink">{option.label}</span>
                <span className="text-[11px] tabular-nums text-muted">{option.sublabel}</span>
              </label>
            ))}
          </div>
          <p className={HELP}>
            {activeDateOption?.isToday
              ? t.callTimeToday
              : t.callTimeFuture(selectedDoctor?.opensLabel ?? "08.00")}
          </p>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-5">
        <label className={LABEL}>
          {t.fullName}
          <input name="fullName" required maxLength={80} autoComplete="name" defaultValue={v.fullName} className="field" />
        </label>

        <label className={LABEL}>
          {t.whatsapp}
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
          <span className={HELP}>{t.whatsappHelp}</span>
        </label>

        <div className="flex flex-col gap-3">
          <label className={LABEL}>
            {t.complaint}
            <textarea
              required
              rows={3}
              maxLength={380}
              placeholder={t.complaintPlaceholder}
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

        <VisitFields values={v} />
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
              {tc.creatingTicket}
            </>
          ) : (
            t.submit
          )}
        </button>
        <p className="text-center text-xs text-muted">{t.privacy}</p>
      </div>
    </form>
  );
}
