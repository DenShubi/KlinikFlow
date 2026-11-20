import "server-only";

import {
  estimateConsultation,
  type EstimateInput,
  type EstimateOutput,
} from "@/lib/ai/estimate";

// The queue engine's single entry point for consultation estimates.
// Delegates to the server-only Gemini estimator (docs/CONTRACT.md), which
// clamps minutes to 5..25, strips PII, and never throws (falls back cleanly).
export async function estimateForQueue(input: EstimateInput): Promise<EstimateOutput> {
  return estimateConsultation(input);
}
