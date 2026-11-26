import type { AgeGroup, VisitPurpose } from "@/lib/ai/estimate-core";

// Visit details asked on both intake forms (patient and receptionist). They
// are coarse and non-identifying: they go to the AI estimator and onto the
// ticket. Age is asked as a group, not a number or birth date, and gender is
// deliberately not asked (data minimisation).

export const AGE_GROUP_OPTIONS: Array<{ value: AgeGroup; label: string; hint: string }> = [
  { value: "toddler", label: "Balita", hint: "0–4" },
  { value: "child", label: "Anak", hint: "5–12" },
  { value: "teen", label: "Remaja", hint: "13–17" },
  { value: "adult", label: "Dewasa", hint: "18–59" },
  { value: "elderly", label: "Lansia", hint: "60+" },
];

export const AGE_GROUP_LABEL = Object.fromEntries(AGE_GROUP_OPTIONS.map((o) => [o.value, o.label])) as Record<AgeGroup, string>;

export const VISIT_PURPOSE_OPTIONS: Array<{ value: VisitPurpose; label: string; hint?: string }> = [
  { value: "new_complaint", label: "Periksa keluhan baru" },
  { value: "follow_up", label: "Kontrol atau lanjutan pengobatan" },
  { value: "routine_check", label: "Cek rutin", hint: "tensi, gula, kolesterol" },
  { value: "certificate", label: "Surat keterangan", hint: "sehat, sakit, rujukan" },
  { value: "procedure", label: "Tindakan", hint: "rawat luka, ganti perban, suntik" },
];

// Short labels for staff screens.
export const VISIT_PURPOSE_LABEL: Record<VisitPurpose, string> = {
  new_complaint: "Keluhan baru",
  follow_up: "Kontrol",
  routine_check: "Cek rutin",
  certificate: "Surat keterangan",
  procedure: "Tindakan",
};

// What the patient picks; only "has a chronic condition: yes/no" is kept.
export const CHRONIC_OPTIONS = [
  { value: "hipertensi", label: "Darah tinggi" },
  { value: "diabetes", label: "Diabetes" },
  { value: "lainnya", label: "Lainnya" },
  { value: "tidak", label: "Tidak" },
] as const;

export type VisitDetails = {
  ageGroup: AgeGroup;
  visitPurpose: VisitPurpose;
  hasChronicCondition?: boolean; // undefined when not answered
};

// Reads and validates the visit fields of either form. Field names:
// ageGroup, visitPurpose, chronic (optional).
export function parseVisitDetails(formData: FormData): { ok: true; value: VisitDetails } | { ok: false; error: string } {
  const group = AGE_GROUP_OPTIONS.find((o) => o.value === String(formData.get("ageGroup") ?? ""));
  if (!group) return { ok: false, error: "Pilih kelompok usia pasien." };

  const purpose = String(formData.get("visitPurpose") ?? "");
  const option = VISIT_PURPOSE_OPTIONS.find((o) => o.value === purpose);
  if (!option) return { ok: false, error: "Pilih tujuan kunjungan." };

  const chronic = String(formData.get("chronic") ?? "");
  const hasChronicCondition =
    chronic === "" ? undefined : chronic === "tidak" ? false : CHRONIC_OPTIONS.some((o) => o.value === chronic) ? true : undefined;

  return {
    ok: true,
    value: { ageGroup: group.value, visitPurpose: option.value, hasChronicCondition },
  };
}
