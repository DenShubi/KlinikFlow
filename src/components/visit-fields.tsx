import { CHRONIC_OPTIONS, MAX_AGE, MIN_AGE, VISIT_PURPOSE_OPTIONS } from "@/lib/queue/visit";

// Visit details shared by the patient intake and the receptionist form:
// age, visit purpose, seen this doctor before, chronic condition (optional).
// Field names match parseVisitDetails() in src/lib/queue/visit.ts.

export type VisitFieldValues = {
  ageYears?: string;
  visitPurpose?: string;
  seenBefore?: string;
  chronic?: string;
};

const LEGEND = "mb-2 text-sm font-semibold text-ink";
const OPTION =
  "flex cursor-pointer items-center gap-3 rounded-[10px] bg-surface px-3.5 shadow-[inset_0_0_0_1px_var(--color-line)] transition-[box-shadow,background-color] duration-[var(--dur-1)] hover:shadow-[inset_0_0_0_1px_#c9ccec] has-[:checked]:bg-tint has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-accent)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";
const SEGMENT =
  "flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-[8px] text-sm font-semibold text-muted transition-colors has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-[0_1px_2px_rgb(18_32_86/0.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

export function VisitFields({ values = {}, dense = false }: { values?: VisitFieldValues; dense?: boolean }) {
  return (
    <div className={`flex flex-col ${dense ? "gap-4" : "gap-5"}`}>
      <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
          Usia (tahun)
          <input
            name="ageYears"
            type="number"
            inputMode="numeric"
            required
            min={MIN_AGE}
            max={MAX_AGE}
            step={1}
            defaultValue={values.ageYears}
            className="field tabular-nums"
          />
        </label>

        <fieldset className="flex min-w-0 flex-col">
          <legend className="mb-1.5 text-sm font-semibold text-ink">Pernah ke dokter ini?</legend>
          <div className="flex gap-1 rounded-[10px] bg-tint p-1">
            <label className={SEGMENT}>
              <input type="radio" name="seenBefore" value="ya" required defaultChecked={values.seenBefore === "ya"} className="sr-only" />
              Ya
            </label>
            <label className={SEGMENT}>
              <input type="radio" name="seenBefore" value="belum" defaultChecked={values.seenBefore === "belum"} className="sr-only" />
              Belum
            </label>
          </div>
        </fieldset>
      </div>
      <p className="-mt-2 text-[13px] text-muted">Isi 0 untuk bayi di bawah 1 tahun.</p>

      <fieldset className="flex min-w-0 flex-col">
        <legend className={LEGEND}>Tujuan kunjungan</legend>
        <div className="flex flex-col gap-2">
          {VISIT_PURPOSE_OPTIONS.map((o) => (
            <label key={o.value} className={`${OPTION} ${dense ? "min-h-[44px] py-2" : "min-h-[48px] py-2.5"}`}>
              <input
                type="radio"
                name="visitPurpose"
                value={o.value}
                required
                defaultChecked={values.visitPurpose === o.value}
                className="h-[18px] w-[18px] shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 text-[15px] leading-snug">
                {o.label}
                {o.hint ? <span className="block text-[13px] text-muted">{o.hint}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col">
        <legend className={LEGEND}>
          Punya penyakit kronis? <span className="font-normal text-muted">(opsional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {CHRONIC_OPTIONS.map((o) => (
            <label key={o.value} className={`${OPTION} min-h-[44px] px-3.5 py-2 text-sm font-medium`}>
              <input type="radio" name="chronic" value={o.value} defaultChecked={values.chronic === o.value} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
