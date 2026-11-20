"use client";

import { useActionState } from "react";

import { AiEstimateLoading } from "@/components/ai";
import { registerRemote, type IntakeState } from "@/lib/intake/actions";

export type DoctorOption = {
  id: string;
  name: string;
  room: string | null;
  waiting: number;
  waitMinutes: number;
};

const FIELD =
  "min-h-[48px] w-full rounded-[12px] border border-line bg-white px-3.5 py-2.5 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";
const LABEL = "flex flex-col gap-1.5 text-sm font-medium text-ink";

function waitLabel(d: DoctorOption): string {
  if (d.waiting === 0) return "Tidak ada antrean";
  return `${d.waiting} menunggu · ±${d.waitMinutes} menit`;
}

export function IntakeForm({ doctors }: { doctors: DoctorOption[] }) {
  const [state, formAction, pending] = useActionState<IntakeState, FormData>(registerRemote, {});
  const v = state.values ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-[18px] border border-line bg-white p-5 shadow-card sm:p-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Pilih dokter</legend>
        {doctors.map((d, i) => (
          <label
            key={d.id}
            className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[12px] border border-line px-3.5 py-3 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
          >
            <input
              type="radio"
              name="doctorId"
              value={d.id}
              required
              defaultChecked={v.doctorId ? v.doctorId === d.id : i === 0}
              className="h-4 w-4 accent-[#2597D0]"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-muted">{d.room}</span>
            </span>
            <span className="shrink-0 text-right text-xs tabular-nums text-muted">{waitLabel(d)}</span>
          </label>
        ))}
      </fieldset>

      <label className={LABEL}>
        Nama lengkap
        <input name="fullName" required maxLength={80} autoComplete="name" defaultValue={v.fullName} className={FIELD} />
      </label>

      <label className={LABEL}>
        Nomor WhatsApp
        <input
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812 3456 7890"
          defaultValue={v.phone}
          className={FIELD}
        />
        <span className="text-xs font-normal text-muted">Untuk kabar saat giliran Anda sudah dekat.</span>
      </label>

      <label className={LABEL}>
        Tanggal lahir <span className="font-normal text-muted">(opsional)</span>
        <input name="birthDate" type="date" autoComplete="bday" defaultValue={v.birthDate} className={FIELD} />
      </label>

      <label className={LABEL}>
        Keluhan
        <textarea
          name="complaint"
          required
          rows={3}
          maxLength={500}
          placeholder="Contoh: demam dan batuk sejak 2 hari"
          defaultValue={v.complaint}
          className={`${FIELD} resize-y`}
        />
      </label>

      <label className="flex min-h-[44px] items-center gap-2.5 text-sm">
        <input type="checkbox" name="isFollowUp" defaultChecked={v.isFollowUp === "on"} className="h-4 w-4 accent-[#2597D0]" />
        Ini kunjungan kontrol (lanjutan pemeriksaan sebelumnya)
      </label>

      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-[12px] border border-[#F5B8B8] bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      {pending ? (
        <AiEstimateLoading
          label="Membuat tiket dan menghitung estimasi…"
          sublabel="Kami memperkirakan lama pemeriksaan untuk menghitung waktu tunggu Anda."
        />
      ) : (
        <button
          type="submit"
          className="min-h-[52px] rounded-full bg-ink px-6 text-base font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Ambil nomor antrean
        </button>
      )}
    </form>
  );
}
