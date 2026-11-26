import "server-only";

import {
  estimateConsultation,
  type EstimateInput,
  type EstimateOutput,
} from "@/lib/ai/estimate";

export type QueueEstimate = EstimateOutput & {
  consultMinutes: number; // what the estimator returned (2..30)
  changeoverMinutes: number; // added for the next patient to come in and sit down
};

const DEFAULT_CHANGEOVER_MINUTES = 1;
const MAX_CHANGEOVER_MINUTES = 10;

// Minutes between one patient leaving and the next being seen (env
// QUEUE_CHANGEOVER_MINUTES, default 1). Not part of the doctor's ranges.
export function getChangeoverMinutes(): number {
  const parsed = Number.parseInt(process.env.QUEUE_CHANGEOVER_MINUTES?.trim() ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CHANGEOVER_MINUTES;
  return Math.min(MAX_CHANGEOVER_MINUTES, Math.max(0, parsed));
}

// The queue engine's single entry point for consultation estimates.
// Delegates to the server-only Gemini estimator (docs/CONTRACT.md), which
// clamps the consultation to 2..30 minutes, strips PII and never throws (falls
// back cleanly). The result's `minutes` is the whole slot the queue plans for:
// consultation + changeover. That total is stored as predicted_minutes.
export async function estimateForQueue(input: EstimateInput): Promise<QueueEstimate> {
  const estimate = await estimateConsultation(input);
  const changeoverMinutes = getChangeoverMinutes();
  return {
    ...estimate,
    consultMinutes: estimate.minutes,
    changeoverMinutes,
    minutes: estimate.minutes + changeoverMinutes,
  };
}
