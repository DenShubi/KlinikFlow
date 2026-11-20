import "server-only";

import type { EstimateInput, EstimateOutput } from "@/lib/ai/estimate";

// The queue engine's only entry point for consultation estimates.
//
// Until integration (26 Nov) this is a stub that always returns the fallback
// wait, so the queue works without the AI module. At integration, replace the
// body with:
//
//   return estimateConsultation(input);   // from "@/lib/ai/estimate"
//
// The contract (docs/CONTRACT.md) guarantees that function never throws.
export async function estimateForQueue(input: EstimateInput): Promise<EstimateOutput> {
  const complaint = input.complaint.trim();
  return {
    minutes: fallbackMinutes(),
    source: "fallback",
    summary: complaint ? `Keluhan: ${complaint.slice(0, 160)}` : undefined,
  };
}

function fallbackMinutes(): number {
  const parsed = Number.parseInt(process.env.QUEUE_FALLBACK_CONSULT_MINUTES ?? "", 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(25, Math.max(5, parsed));
}
