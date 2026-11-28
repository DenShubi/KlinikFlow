"use client";

import { useT } from "@/components/i18n/provider";
import { AGE_GROUP_RANGES, AGE_GROUPS, CHRONIC_VALUES, VISIT_PURPOSES } from "@/lib/queue/visit";

// Visit details shared by the patient intake and the receptionist form:
// age group, visit purpose, chronic condition (optional). Field names match parseVisitDetails() in src/lib/queue/visit.ts.

export type VisitFieldValues = {
  ageGroup?: string;
  visitPurpose?: string;
  chronic?: string;
};

const LEGEND = "mb-2 text-sm font-semibold text-ink";
const OPTION =
  "flex cursor-pointer items-center gap-3 rounded-[10px] bg-surface px-3.5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-[box-shadow,background-color] duration-[var(--dur-1)] hover:shadow-[inset_0_0_0_1px_#c9ccec] has-[:checked]:bg-tint has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

export function VisitFields({ values = {}, dense = false }: { values?: VisitFieldValues; dense?: boolean }) {
  const t = useT().visit;
  return (
    <div className={`flex flex-col ${dense ? "gap-4" : "gap-5"}`}>
      <fieldset className="flex min-w-0 flex-col">
        <legend className={LEGEND}>
          {t.ageGroup} <span className="font-normal text-muted">{t.ageUnit}</span>
        </legend>
        <div className="grid grid-cols-5 gap-1.5">
          {AGE_GROUPS.map((g) => (
            <label
              key={g}
              className={`${OPTION} min-h-[56px] flex-col justify-center gap-0.5 px-1 py-2 text-center`}
            >
              <input
                type="radio"
                name="ageGroup"
                value={g}
                required
                defaultChecked={values.ageGroup === g}
                className="sr-only"
              />
              <span className="text-sm font-semibold leading-tight">{t.ageGroups[g]}</span>
              <span className="whitespace-nowrap text-xs leading-tight text-muted tabular-nums">{AGE_GROUP_RANGES[g]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col">
        <legend className={LEGEND}>{t.purpose}</legend>
        <div className="flex flex-col gap-2">
          {VISIT_PURPOSES.map((p) => (
            <label key={p} className={`${OPTION} ${dense ? "min-h-[44px] py-2" : "min-h-[48px] py-2.5"}`}>
              <input
                type="radio"
                name="visitPurpose"
                value={p}
                required
                defaultChecked={values.visitPurpose === p}
                className="h-[18px] w-[18px] shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 text-[15px] leading-snug">
                {t.purposes[p].label}
                {t.purposes[p].hint ? <span className="block text-[13px] text-muted">{t.purposes[p].hint}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col">
        <legend className={LEGEND}>
          {t.chronic} <span className="font-normal text-muted">{t.optional}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {CHRONIC_VALUES.map((c) => (
            <label key={c} className={`${OPTION} min-h-[44px] px-3.5 py-2 text-sm font-medium`}>
              <input type="radio" name="chronic" value={c} defaultChecked={values.chronic === c} className="sr-only" />
              {t.chronicOptions[c]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
