"use server";

import { redirect } from "next/navigation";

import {
  clinicAlwaysOpen,
  clinicCloseTimestampMs,
  isDoctorWorkingOnDate,
} from "@/lib/clinic-hours";
import { clinicToday } from "@/lib/clinic-time";
import { normalizePhone } from "@/lib/phone";
import { estimateForQueue } from "@/lib/queue/estimator";
import { FALLBACK_SLOT_MINUTES } from "@/lib/queue/rules";
import { parseVisitDetails } from "@/lib/queue/visit";
import { createAdminClient } from "@/lib/supabase/admin";

export type IntakeState = {
  error?: string;
  values?: Record<string, string>;
};

const MAX_NAME = 80;
const MAX_COMPLAINT = 500;

// Remote registration by a patient (not signed in). Runs with the secret key,
// so every input is validated here and only narrow queries are made.
export async function registerRemote(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const today = clinicToday();
  const values = {
    doctorId: String(formData.get("doctorId") ?? ""),
    serviceDate: String(formData.get("serviceDate") ?? today).trim() || today,
    fullName: String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " "),
    phone: String(formData.get("phone") ?? "").trim(),
    complaint: String(formData.get("complaint") ?? "").trim(),
    // Visit details (kept so the form can show them again after an error).
    ageGroup: String(formData.get("ageGroup") ?? ""),
    visitPurpose: String(formData.get("visitPurpose") ?? ""),
    seenBefore: String(formData.get("seenBefore") ?? ""),
    chronic: String(formData.get("chronic") ?? ""),
  };
  const fail = (error: string): IntakeState => ({ error, values });

  // Hidden field that people never fill in; simple bots do.
  if (String(formData.get("website") ?? "")) return fail("Pendaftaran gagal. Coba lagi.");

  if (!values.doctorId) return fail("Pilih dokter.");
  if (!values.fullName) return fail("Nama lengkap wajib diisi.");
  if (values.fullName.length > MAX_NAME) return fail("Nama terlalu panjang.");
  const phone = normalizePhone(values.phone);
  if (!phone) return fail("Nomor WhatsApp wajib diisi agar kami bisa mengabari Anda.");
  if (phone === "invalid") return fail("Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.");
  if (values.complaint.length < 3) return fail("Ceritakan keluhan Anda secara singkat.");
  if (values.complaint.length > MAX_COMPLAINT) return fail("Keluhan terlalu panjang (maks. 500 karakter).");
  const visit = parseVisitDetails(formData);
  if (!visit.ok) return fail(visit.error);

  const admin = createAdminClient();

  const { data: doctor } = await admin
    .from("doctors")
    .select("id, work_days, opens_at, closes_at")
    .eq("id", values.doctorId)
    .eq("is_active", true)
    .maybeSingle();
  if (!doctor) return fail("Dokter tidak tersedia. Pilih dokter lain.");
  const dateCheck = isDoctorWorkingOnDate(doctor, values.serviceDate);
  if (!dateCheck.ok) return fail(dateCheck.reason ?? "Tanggal kunjungan tidak tersedia.");

  // Same name and number already in this date's queue for this doctor: show that ticket.
  const { data: patients } = await admin
    .from("patients")
    .select("id")
    .eq("phone", phone)
    .ilike("full_name", values.fullName.replace(/[\\%_]/g, (c) => `\\${c}`)); // exact, case-insensitive
  const patientIds = patients?.map((p) => p.id) ?? [];

  if (patientIds.length > 0) {
    const { data: existing } = await admin
      .from("queue_tickets")
      .select("id")
      .in("patient_id", patientIds)
      .eq("doctor_id", doctor.id)
      .eq("service_date", values.serviceDate)
      .in("status", ["waiting", "called", "in_consultation"])
      .limit(1)
      .maybeSingle();
    if (existing) redirect(`/ticket/${existing.id}`);
  }

  // Capacity guard: prevent overbooking past doctor's closes_at on the chosen date.
  const enforceCapacity = !(clinicAlwaysOpen() && values.serviceDate === today);
  if (enforceCapacity) {
    const { data: activeOnDate } = await admin
      .from("queue_tickets")
      .select("estimated_call_at, predicted_minutes")
      .eq("doctor_id", doctor.id)
      .eq("service_date", values.serviceDate)
      .in("status", ["waiting", "called", "in_consultation"]);

    const lastEndMs = (activeOnDate ?? []).reduce((max, t) => {
      if (!t.estimated_call_at) return max;
      const endMs = Date.parse(t.estimated_call_at) + (t.predicted_minutes ?? FALLBACK_SLOT_MINUTES) * 60000;
      return Math.max(max, endMs);
    }, 0);

    const closeMs = clinicCloseTimestampMs(values.serviceDate, doctor.closes_at);
    if (lastEndMs > 0 && lastEndMs >= closeMs) {
      return fail("Kuota antrean pada tanggal tersebut sudah penuh. Silakan pilih tanggal lain.");
    }
  }

  let patientId = patientIds[0];
  if (!patientId) {
    const { data: created, error } = await admin
      .from("patients")
      .insert({ full_name: values.fullName, phone }) // the age group is stored per visit on the ticket, not a birth date
      .select("id")
      .single();
    if (error || !created) return fail("Pendaftaran gagal. Coba lagi.");
    patientId = created.id;
  }

  const estimate = await estimateForQueue({
    ticketId: "",
    complaint: values.complaint,
    ageGroup: visit.value.ageGroup,
    visitPurpose: visit.value.visitPurpose,
    isNewPatient: visit.value.isNewPatient,
    hasChronicCondition: visit.value.hasChronicCondition,
    doctorId: doctor.id,
  });

  const { data: ticket, error } = await admin.rpc("queue_create_ticket", {
    p_doctor_id: doctor.id,
    p_patient_id: patientId,
    p_channel: "remote",
    p_complaint: values.complaint,
    p_is_follow_up: visit.value.visitPurpose === "follow_up",
    p_visit_purpose: visit.value.visitPurpose,
    p_is_new_patient: visit.value.isNewPatient,
    p_has_chronic_condition: visit.value.hasChronicCondition,
    p_age_group: visit.value.ageGroup,
    p_predicted_minutes: estimate.minutes,
    p_prediction_source: estimate.source,
    p_prediction_confidence: estimate.confidence,
    p_prediction_model: estimate.model,
    p_ai_summary: estimate.summary,
    p_service_date: values.serviceDate,
  });
  if (error || !ticket) return fail("Pendaftaran gagal. Coba lagi.");

  redirect(`/ticket/${ticket.id}`);
}
