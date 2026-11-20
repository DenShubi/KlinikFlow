// The queue functions in the database raise short machine-readable messages
// (see supabase/migrations/*_queue_engine.sql). This turns them into text
// for staff.
const MESSAGES: Record<string, string> = {
  not_allowed: "Anda tidak berhak mengubah antrean ini.",
  ticket_not_found: "Tiket tidak ditemukan.",
  doctor_not_available: "Dokter tidak tersedia.",
  complaint_required: "Keluhan wajib diisi.",
  consultation_in_progress: "Selesaikan pemeriksaan yang sedang berjalan dulu.",
  patient_already_called: "Masih ada pasien yang sudah dipanggil.",
  no_patient_arrived: "Pasien berikutnya belum tiba di klinik.",
  queue_empty: "Tidak ada pasien yang menunggu.",
  invalid_status: "Status tiket sudah berubah. Muat ulang halaman.",
};

export function queueErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Terjadi kesalahan.";
  if (error.message && MESSAGES[error.message]) return MESSAGES[error.message];
  // Row-level security refused the change.
  if (error.code === "42501") return MESSAGES.not_allowed;
  return "Terjadi kesalahan. Coba lagi.";
}
