"use server";

import { refresh } from "next/cache";

import { requireStaff } from "@/lib/auth/dal";
import { clinicToday } from "@/lib/clinic-time";
import { normalizePhone } from "@/lib/phone";
import { estimateForQueue } from "@/lib/queue/estimator";
import { queueErrorMessage } from "@/lib/queue/errors";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ActionResult = { ok: boolean; error?: string; message?: string };

type Channel = Database["public"]["Enums"]["ticket_channel"];

function ageInYears(birthDate: string, today: string): number | undefined {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if (!by || !ty) return undefined;
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age >= 0 && age < 130 ? age : undefined;
}

// Receptionist adds a patient to a doctor's queue: creates the patient,
// estimates the consultation length, then appends the ticket.
export async function createTicket(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff("receptionist");

  const doctorId = String(formData.get("doctorId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const complaint = String(formData.get("complaint") ?? "").trim();
  const birthDate = String(formData.get("birthDate") ?? "").trim();
  const isFollowUp = formData.get("isFollowUp") === "on";
  const channel: Channel = formData.get("channel") === "remote" ? "remote" : "walk_in";
  const phone = normalizePhone(String(formData.get("phone") ?? ""));

  if (!doctorId) return { ok: false, error: "Pilih dokter." };
  if (!fullName) return { ok: false, error: "Nama pasien wajib diisi." };
  if (!complaint) return { ok: false, error: "Keluhan wajib diisi." };
  if (phone === "invalid") return { ok: false, error: "Nomor WhatsApp tidak valid." };

  const supabase = await createClient();
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({ full_name: fullName, phone, birth_date: birthDate || null })
    .select("id")
    .single();
  if (patientError) return { ok: false, error: queueErrorMessage(patientError) };

  const estimate = await estimateForQueue({
    ticketId: "", // not created yet; the estimator never sends it anywhere
    complaint,
    patientAgeYears: birthDate ? ageInYears(birthDate, clinicToday()) : undefined,
    isFollowUp,
    doctorId,
  });

  const { data: ticket, error } = await supabase.rpc("queue_create_ticket", {
    p_doctor_id: doctorId,
    p_patient_id: patient.id,
    p_channel: channel,
    p_complaint: complaint,
    p_is_follow_up: isFollowUp,
    p_predicted_minutes: estimate.minutes,
    p_prediction_source: estimate.source,
    p_prediction_confidence: estimate.confidence,
    p_prediction_model: estimate.model,
    p_ai_summary: estimate.summary,
  });
  // On failure the new patient row stays; it is harmless and can be reused later.
  if (error) return { ok: false, error: queueErrorMessage(error) };

  refresh();
  return { ok: true, message: `Tiket nomor ${ticket.ticket_number} dibuat untuk ${fullName}.` };
}

async function runTicketOperation(
  fn: "queue_check_in" | "queue_start_consultation" | "queue_finish_consultation" | "queue_cancel_ticket",
  ticketId: string,
): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_ticket_id: ticketId });
  if (error) return { ok: false, error: queueErrorMessage(error) };
  refresh();
  return { ok: true };
}

// Bound in the page: callNext.bind(null, doctorId). The extra arguments come from useActionState.
export async function callNext(doctorId: string): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("queue_call_next", { p_doctor_id: doctorId });
  if (error) return { ok: false, error: queueErrorMessage(error) };
  refresh();
  return { ok: true };
}

export async function checkIn(ticketId: string): Promise<ActionResult> {
  return runTicketOperation("queue_check_in", ticketId);
}

export async function startConsultation(ticketId: string): Promise<ActionResult> {
  return runTicketOperation("queue_start_consultation", ticketId);
}

export async function finishConsultation(ticketId: string): Promise<ActionResult> {
  return runTicketOperation("queue_finish_consultation", ticketId);
}

export async function cancelTicket(ticketId: string): Promise<ActionResult> {
  return runTicketOperation("queue_cancel_ticket", ticketId);
}
