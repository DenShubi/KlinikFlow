import type { EstimateOutput } from "@/lib/ai/estimate-core";

import { AiEstimateLoading } from "./ai-estimate-loading";
import { EstimateSourceBadge } from "./estimate-source-badge";

export type DoctorSummaryTicket = {
  ticketCode: string;
  patientName?: string | null;
  patientAgeYears?: number | null;
  isFollowUp?: boolean;
  complaint: string;
  predictedMinutes: number | null;
  predictionSource: EstimateOutput["source"] | null;
  predictionConfidence?: number | null;
  predictionModel?: string | null;
  aiSummary?: string | null;
};

export type DoctorSummaryCardProps = {
  ticket?: DoctorSummaryTicket | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
};

const CARD_SHELL =
  "w-full rounded-[20px] border border-line bg-white p-5 sm:p-6 text-ink shadow-card";

function TicketHeader({ ticket }: { ticket: DoctorSummaryTicket }) {
  const visitType = ticket.isFollowUp ? "Kontrol" : "Kunjungan baru";
  const ageLabel =
    typeof ticket.patientAgeYears === "number" && Number.isFinite(ticket.patientAgeYears)
      ? `Usia ${Math.round(ticket.patientAgeYears)} thn`
      : null;

  const hasEstimate =
    typeof ticket.predictedMinutes === "number" &&
    Number.isFinite(ticket.predictedMinutes) &&
    ticket.predictionSource !== null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="text-2xl font-semibold leading-none tracking-[-0.04em] tabular-nums text-ink">
            {ticket.ticketCode}
          </span>
          {ticket.patientName ? (
            <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-ink">
              {ticket.patientName}
            </h3>
          ) : null}
        </div>

        <p className="text-xs leading-[1.4] text-muted">
          <span>{visitType}</span>
          {ageLabel ? (
            <>
              <span aria-hidden="true" className="mx-1.5 text-faint">
                /
              </span>
              <span className="tabular-nums">{ageLabel}</span>
            </>
          ) : null}
        </p>
      </div>

      {hasEstimate && ticket.predictionSource ? (
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <div className="flex items-baseline gap-1 text-ink">
            <span className="text-2xl font-semibold leading-none tracking-[-0.04em] tabular-nums">
              {Math.round(ticket.predictedMinutes!)}
            </span>
            <span className="text-xs font-medium text-muted">mnt</span>
          </div>
          <EstimateSourceBadge
            source={ticket.predictionSource}
            confidence={ticket.predictionConfidence}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DoctorSummaryCard({
  ticket,
  isLoading = false,
  errorMessage = null,
  onRetry,
  className = "",
}: DoctorSummaryCardProps) {
  // Empty state: no patient selected yet
  if (!ticket && !isLoading && !errorMessage) {
    return (
      <section aria-label="Ringkasan pasien" className={`${CARD_SHELL} ${className}`.trim()}>
        <div className="rounded-[12px] border border-dashed border-line bg-canvas p-5 text-center sm:p-6">
          <p className="text-sm font-medium text-ink">Belum ada pasien yang dipilih</p>
          <p className="mt-1 text-xs leading-[1.45] text-muted">
            Pilih nomor antrean dari daftar untuk melihat ringkasan keluhan dan estimasi durasi
            konsultasi.
          </p>
        </div>
      </section>
    );
  }

  // Error state: explain what failed, offer retry, keep raw complaint readable if available
  if (errorMessage) {
    return (
      <section aria-label="Ringkasan pasien" className={`${CARD_SHELL} ${className}`.trim()}>
        {ticket ? (
          <>
            <TicketHeader ticket={ticket} />
            <hr className="my-4 border-0 border-t border-dashed border-line" />
          </>
        ) : null}

        <div
          role="alert"
          className="rounded-[12px] border border-danger-line bg-danger-soft p-4 text-danger"
        >
          <p className="text-sm font-semibold">Gagal memuat ringkasan keluhan</p>
          <p className="mt-1 text-xs leading-[1.45]">{errorMessage}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-full bg-ink px-5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Coba muat ulang
            </button>
          ) : null}
        </div>

        {ticket?.complaint ? (
          <div className="mt-4 rounded-[12px] bg-canvas p-3.5">
            <p className="text-xs font-medium text-muted">Keluhan asli pasien</p>
            <p className="mt-1 text-sm leading-[1.5] text-ink">{ticket.complaint}</p>
          </div>
        ) : null}
      </section>
    );
  }

  // Loading state: waiting for ticket or waiting for estimateConsultation to complete
  const waitingForEstimate =
    isLoading || (ticket !== null && ticket !== undefined && ticket.predictedMinutes === null);

  if (waitingForEstimate) {
    return (
      <section aria-label="Ringkasan pasien" className={`${CARD_SHELL} ${className}`.trim()}>
        {ticket ? (
          <>
            <TicketHeader ticket={ticket} />
            <hr className="my-4 border-0 border-t border-dashed border-line" />
          </>
        ) : null}
        <AiEstimateLoading />
      </section>
    );
  }

  // Ready state
  const activeTicket = ticket!;
  const summaryText =
    activeTicket.aiSummary && activeTicket.aiSummary.trim().length > 0
      ? activeTicket.aiSummary.trim()
      : activeTicket.complaint.trim();

  return (
    <section
      aria-label={`Ringkasan pasien ${activeTicket.ticketCode}`}
      className={`${CARD_SHELL} ${className}`.trim()}
    >
      <TicketHeader ticket={activeTicket} />

      <hr className="my-4 border-0 border-t border-dashed border-line" />

      <div className="space-y-3.5">
        <div>
          <p className="text-xs font-medium text-muted">Ringkasan keluhan</p>
          <p className="mt-1.5 text-[15px] leading-[1.55] tracking-[-0.01em] text-ink">
            {summaryText || "Pasien belum menuliskan keluhan."}
          </p>
        </div>


        {activeTicket.complaint.trim().length > 0 ? (
          <details className="group rounded-[12px] border border-line-soft bg-canvas">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-[12px] px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <span>Lihat keluhan asli pasien</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-muted transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className="border-t border-line-soft px-3.5 py-3 text-sm leading-[1.5] text-ink">
              {activeTicket.complaint}
            </div>
          </details>
        ) : null}
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-canvas px-3.5 py-2.5 text-[11px] leading-[1.4] text-muted">
        <span>Ringkasan otomatis, bukan diagnosis.</span>
      </footer>
    </section>
  );
}
