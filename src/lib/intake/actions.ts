"use server";

import { redirect } from "next/navigation";

import { ageInYears } from "@/lib/age";
import { clinicToday } from "@/lib/clinic-time";
import { normalizePhone } from "@/lib/phone";
import { estimateForQueue } from "@/lib/queue/estimator";
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
  const values = {
    doctorId: String(formData.get("doctorId") ?? ""),
    fullName: String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " "),
    phone: String(formData.get("phone") ?? "").trim(),
    birthDate: String(formData.get("birthDate") ?? "").trim(),
    complaint: String(formData.get("complaint") ?? "").trim(),
    isFollowUp: formData.get("isFollowUp") === "on" ? "on" : "",
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
  const today = clinicToday();
  if (values.birthDate && (values.birthDate > today || ageInYears(values.birthDate, today) === undefined)) {
    return fail("Tanggal lahir tidak valid.");
  }
  if (values.complaint.length < 3) return fail("Ceritakan keluhan Anda secara singkat.");
  if (values.complaint.length > MAX_COMPLAINT) return fail("Keluhan terlalu panjang (maks. 500 karakter).");

  const admin = createAdminClient();

  const { data: doctor } = await admin
    .from("doctors")
    .select("id")
    .eq("id", values.doctorId)
    .eq("is_active", true)
    .maybeSingle();
  if (!doctor) return fail("Dokter tidak tersedia. Pilih dokter lain.");

  // Same name and number already in today's queue for this doctor: show that ticket.
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
      .eq("service_date", today)
      .in("status", ["waiting", "called", "in_consultation"])
      .limit(1)
      .maybeSingle();
    if (existing) redirect(`/ticket/${existing.id}`);
  }

  let patientId = patientIds[0];
  if (!patientId) {
    const { data: created, error } = await admin
      .from("patients")
      .insert({ full_name: values.fullName, phone, birth_date: values.birthDate || null })
      .select("id")
      .single();
    if (error || !created) return fail("Pendaftaran gagal. Coba lagi.");
    patientId = created.id;
  }

  const estimate = await estimateForQueue({
    ticketId: "",
    complaint: values.complaint,
    patientAgeYears: ageInYears(values.birthDate, today),
    isFollowUp: values.isFollowUp === "on",
    doctorId: doctor.id,
  });

  const { data: ticket, error } = await admin.rpc("queue_create_ticket", {
    p_doctor_id: doctor.id,
    p_patient_id: patientId,
    p_channel: "remote",
    p_complaint: values.complaint,
    p_is_follow_up: values.isFollowUp === "on",
    p_predicted_minutes: estimate.minutes,
    p_prediction_source: estimate.source,
    p_prediction_confidence: estimate.confidence,
    p_prediction_model: estimate.model,
    p_ai_summary: estimate.summary,
  });
  if (error || !ticket) return fail("Pendaftaran gagal. Coba lagi.");

  redirect(`/ticket/${ticket.id}`);
}
