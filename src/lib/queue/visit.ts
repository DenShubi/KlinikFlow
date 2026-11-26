import type { VisitPurpose } from "@/lib/ai/estimate-core";

// Visit details asked on both intake forms (patient and receptionist). They
// are coarse and non-identifying: they go to the AI estimator and onto the
// ticket. Gender is deliberately not asked (data minimisation).

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

export const MIN_AGE = 0;
export const MAX_AGE = 120;

export type VisitDetails = {
  ageYears: number;
  visitPurpose: VisitPurpose;
  isNewPatient: boolean;
  hasChronicCondition?: boolean; // undefined when not answered
};

// Reads and validates the visit fields of either form. Field names:
// ageYears, visitPurpose, seenBefore ("ya" | "belum"), chronic (optional).
export function parseVisitDetails(formData: FormData): { ok: true; value: VisitDetails } | { ok: false; error: string } {
  const ageRaw = String(formData.get("ageYears") ?? "").trim();
  const age = /^\d{1,3}$/.test(ageRaw) ? Number(ageRaw) : Number.NaN;
  if (!ageRaw) return { ok: false, error: "Isi usia pasien (tahun)." };
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    return { ok: false, error: `Usia harus angka ${MIN_AGE}–${MAX_AGE} tahun.` };
  }

  const purpose = String(formData.get("visitPurpose") ?? "");
  const option = VISIT_PURPOSE_OPTIONS.find((o) => o.value === purpose);
  if (!option) return { ok: false, error: "Pilih tujuan kunjungan." };

  const seenBefore = String(formData.get("seenBefore") ?? "");
  if (seenBefore !== "ya" && seenBefore !== "belum") {
    return { ok: false, error: "Jawab apakah pasien pernah berobat ke dokter ini." };
  }

  const chronic = String(formData.get("chronic") ?? "");
  const hasChronicCondition =
    chronic === "" ? undefined : chronic === "tidak" ? false : CHRONIC_OPTIONS.some((o) => o.value === chronic) ? true : undefined;

  return {
    ok: true,
    value: { ageYears: age, visitPurpose: option.value, isNewPatient: seenBefore === "belum", hasChronicCondition },
  };
}
