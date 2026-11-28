import type { AgeGroup, VisitPurpose } from "@/lib/ai/estimate-core";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";

// Visit details asked on both intake forms (patient and receptionist). They
// are coarse and non-identifying: they go to the AI estimator and onto the
// ticket. Age is asked as a group, not a number or birth date, and gender is
// deliberately not asked (data minimisation). Labels live in the
// dictionaries (src/lib/i18n/dictionaries, "visit").

export const AGE_GROUP_RANGES: Record<AgeGroup, string> = {
  toddler: "0–4",
  child: "5–12",
  teen: "13–17",
  adult: "18–59",
  elderly: "60+",
};

// Same values as AGE_GROUPS and VISIT_PURPOSES in estimate-core.ts, repeated
// here (type-checked) so the browser bundle does not import the AI module.
export const AGE_GROUPS = ["toddler", "child", "teen", "adult", "elderly"] as const satisfies readonly AgeGroup[];
export const VISIT_PURPOSES = [
  "new_complaint",
  "follow_up",
  "routine_check",
  "certificate",
  "procedure",
] as const satisfies readonly VisitPurpose[];

// What the patient picks; only "has a chronic condition: yes/no" is kept.
export const CHRONIC_VALUES = ["hipertensi", "diabetes", "lainnya", "tidak"] as const;

export type VisitDetails = {
  ageGroup: AgeGroup;
  visitPurpose: VisitPurpose;
  hasChronicCondition?: boolean; // undefined when not answered
};

// Reads and validates the visit fields of either form. Field names:
// ageGroup, visitPurpose, chronic (optional).
export function parseVisitDetails(
  formData: FormData,
  locale: Locale = "id",
): { ok: true; value: VisitDetails } | { ok: false; error: string } {
  const errors = DICTIONARIES[locale].visit.errors;
  const group = AGE_GROUPS.find((g) => g === String(formData.get("ageGroup") ?? ""));
  if (!group) return { ok: false, error: errors.pickAge };

  const purpose = VISIT_PURPOSES.find((p) => p === String(formData.get("visitPurpose") ?? ""));
  if (!purpose) return { ok: false, error: errors.pickPurpose };

  const chronic = String(formData.get("chronic") ?? "");
  const hasChronicCondition =
    chronic === "" ? undefined : chronic === "tidak" ? false : (CHRONIC_VALUES as readonly string[]).includes(chronic) ? true : undefined;

  return {
    ok: true,
    value: { ageGroup: group, visitPurpose: purpose, hasChronicCondition },
  };
}
