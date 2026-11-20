"use client";

import { useState } from "react";

import {
  AiEstimateLoading,
  DoctorSummaryCard,
  EstimateSourceBadge,
  type DoctorSummaryTicket,
} from "@/components/ai";

const SYNTHETIC_AI_TICKET: DoctorSummaryTicket = {
  ticketCode: "A-04",
  patientName: "Pasien Sintetis 01",
  patientAgeYears: 54,
  isFollowUp: false,
  complaint:
    "Perawatan luka pasca kecelakaan di kaki, ganti perban, dan mengeluh sesak napas ringan sejak semalam.",
  predictedMinutes: 25,
  predictionSource: "ai",
  predictionConfidence: 0.88,
  predictionModel: "gemini-3.5-flash-lite",
  aiSummary:
    "Pasien usia 54 tahun datang untuk perawatan luka pasca kecelakaan dan penggantian perban di kaki, disertai keluhan sesak napas ringan sejak semalam.",
};

const SYNTHETIC_FALLBACK_TICKET: DoctorSummaryTicket = {
  ticketCode: "A-05",
  patientName: "Pasien Sintetis 02",
  patientAgeYears: 31,
  isFollowUp: true,
  complaint: "Batuk pilek ringan dan demam 1 hari.",
  predictedMinutes: 10,
  predictionSource: "fallback",
  aiSummary: "Keluhan: Batuk pilek ringan dan demam 1 hari.",
};

const SYNTHETIC_LOADING_TICKET: DoctorSummaryTicket = {
  ticketCode: "A-06",
  patientName: "Pasien Sintetis 03",
  patientAgeYears: 27,
  isFollowUp: true,
  complaint: "Minta surat keterangan sehat dan cek tensi rutin.",
  predictedMinutes: null,
  predictionSource: null,
};

export default function AiComponentsPreviewPage() {
  const [errorCardState, setErrorCardState] = useState<"error" | "loading" | "recovered">("error");

  function handleRetry() {
    setErrorCardState("loading");
    window.setTimeout(() => {
      setErrorCardState("recovered");
    }, 900);
  }

  return (
    <main className="min-h-screen bg-[#F5F5F5] px-4 py-10 text-[#070709] sm:px-8">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-2 border-b border-[#D9DEE5] pb-6">
          <p className="text-xs font-medium text-[#176B96]">
            Dev Preview (Synthetic Data Only)
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#070709]">
            KlinikFlow AI UI Components
          </h1>
          <p className="max-w-2xl text-sm leading-[1.5] text-[#60606C]">
            Halaman pratinjau sementara untuk memeriksa tampilan, kontras, dan seluruh state
            komponen di <code className="rounded bg-white px-1.5 py-0.5 text-xs">src/components/ai/</code>.
          </p>
        </header>

        <section aria-labelledby="badges-heading" className="space-y-3">
          <h2 id="badges-heading" className="text-lg font-semibold tracking-[-0.02em]">
            1. EstimateSourceBadge
          </h2>
          <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-[#D9DEE5] bg-white p-5">
            <EstimateSourceBadge source="ai" />
            <EstimateSourceBadge source="ai" confidence={0.92} showConfidence />
            <EstimateSourceBadge source="fallback" />
            <EstimateSourceBadge source="ai" compact />
            <EstimateSourceBadge source="fallback" compact />
          </div>
        </section>

        <section aria-labelledby="loading-heading" className="space-y-3">
          <h2 id="loading-heading" className="text-lg font-semibold tracking-[-0.02em]">
            2. AiEstimateLoading
          </h2>
          <div className="space-y-4 rounded-[18px] border border-[#D9DEE5] bg-white p-5">
            <AiEstimateLoading />
            <div>
              <p className="mb-2 text-xs font-medium text-[#60606C]">Compact row variant</p>
              <AiEstimateLoading compact label="Menghitung estimasi..." />
            </div>
          </div>
        </section>

        <section aria-labelledby="cards-heading" className="space-y-5">
          <h2 id="cards-heading" className="text-lg font-semibold tracking-[-0.02em]">
            3. DoctorSummaryCard (All States)
          </h2>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#60606C]">AI Estimate Ready</p>
              <DoctorSummaryCard ticket={SYNTHETIC_AI_TICKET} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[#60606C]">Fallback Mode Active</p>
              <DoctorSummaryCard ticket={SYNTHETIC_FALLBACK_TICKET} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[#60606C]">Loading Estimate</p>
              <DoctorSummaryCard ticket={SYNTHETIC_LOADING_TICKET} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[#60606C]">Empty State (No Selection)</p>
              <DoctorSummaryCard ticket={null} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#60606C]">
                Error State (Interactive Retry Demo)
              </p>
              {errorCardState === "recovered" ? (
                <button
                  type="button"
                  onClick={() => setErrorCardState("error")}
                  className="min-h-[36px] cursor-pointer rounded-full border border-[#BEBECC] bg-white px-3.5 text-xs font-medium text-[#070709] hover:bg-[#F5F5F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2597D0]"
                >
                  Reset ke state error
                </button>
              ) : null}
            </div>
            <DoctorSummaryCard
              ticket={
                errorCardState === "recovered"
                  ? SYNTHETIC_AI_TICKET
                  : SYNTHETIC_LOADING_TICKET
              }
              isLoading={errorCardState === "loading"}
              errorMessage={
                errorCardState === "error"
                  ? "Koneksi ke server terputus saat mengambil ringkasan keluhan."
                  : null
              }
              onRetry={handleRetry}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
