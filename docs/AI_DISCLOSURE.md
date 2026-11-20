# KlinikFlow AI Disclosure & Responsible Use Notes

This document describes how generative AI is used in KlinikFlow, what guardrails are enforced in code, and what limitations apply. It is written for both repository transparency (`README.md`) and **STACK 2026 Proposal Section 7 (AI Disclosure)**.

---

## 1. Role & Strict Boundaries of AI

KlinikFlow uses a server-side language model for **two narrow operational tasks** during queue intake (`src/lib/ai/estimate.ts`):

1. **Consultation duration estimation:** Predicts an expected general-practice consultation length as a whole number between **5 and 25 minutes** from the patient's complaint text, optional age in years, and follow-up status.
2. **Neutral symptom summary:** Produces a 1 to 2 sentence factual restatement of the patient's reported complaint for the doctor's queue card.

**What the AI strictly does NOT do:**
- It **never** diagnoses diseases or names suspected medical conditions.
- It **never** recommends medications, dosages, or clinical treatments.
- It **never** reorders the queue by clinical urgency or replaces a doctor's triage judgment.
- Every doctor card displays an explicit notice: *"Ringkasan keluhan saja, bukan diagnosis medis atau rekomendasi obat."*

---

## 2. Model & System Architecture

| Component | Implementation |
| --- | --- |
| **Provider & SDK** | Google Gemini API via official `@google/genai` SDK |
| **Default Model** | `gemini-3.5-flash-lite` (configurable via `GEMINI_MODEL`) |
| **Execution Boundary** | Server-only (`import "server-only"` in `src/lib/ai/estimate.ts`); `GEMINI_API_KEY` never reaches the browser |
| **Output Enforcement** | Gemini Structured Outputs (`responseMimeType: "application/json"` with strict JSON schema for `minutes`, `confidence`, `summary`) |
| **Prompt Calibration** | System prompt calibrated with 8 synthetic Indonesian clinic reference examples anchored to November 2026 Kediri GP observations (5 to 25 min range), while permitting continuous integer predictions across `5..25` |
| **UI Transparency** | `EstimateSourceBadge` labels whether a wait time came from symptom estimation (`Estimasi keluhan`) or clinic default (`Estimasi standar`); `DoctorSummaryCard` displays the model ID when `source === "ai"` |

---

## 3. Privacy & Data Minimization

- **Zero real patient data in repository:** All development, testing, and evaluation datasets (`data/eval-complaints.json`) are 100% synthetic.
- **Strict PII stripping before API calls:** `buildSanitizedPromptPayload` in `src/lib/ai/estimate-core.ts` forwards **only** `complaint`, optional rounded `patientAgeYears`, and optional `isFollowUp`. Patient names, phone numbers, `birth_date`, `ticketId`, and `doctorId` are never included in the Gemini payload (verified by automated unit check in `scripts/test-estimate.ts`).
- **Role-based visibility:** Symptom summaries are designed exclusively for authenticated doctor views, separate from front-desk queue identity data.

---

## 4. Safety, Clamping & Fallback Resilience

- **Hard numeric bounds:** Parsed outputs are validated without unsafe type assertions. `minutes` is hard-clamped to integer `5..25` and `confidence` to `0..1`.
- **Non-throwing fallback:** `estimateConsultation` never throws. On empty/short complaints (`< 3` characters), missing `GEMINI_API_KEY`, invalid JSON, HTTP errors/rate limits, or timeout (`GEMINI_TIMEOUT_MS`, default `4000ms`, recommended `6000-8000ms` on clinic networks), it immediately returns the clinic default (`QUEUE_FALLBACK_CONSULT_MINUTES`, default `10` minutes) with `source: "fallback"`.
- **Degraded-mode continuity:** If the AI service is offline or rate-limited, the clinic queue continues operating normally with visible fallback badges (`Estimasi standar`) and verbatim patient complaints still readable by the doctor.

---

## 5. Evaluation Evidence & Known Limitations

Benchmarked on **24 synthetic Indonesian and English clinic cases** (`data/eval-complaints.json`, `scripts/eval-estimate.ts`, full output in `data/eval-report.json`) with `gemini-3.5-flash-lite` and `GEMINI_TIMEOUT_MS=8000`:

- **Accuracy vs. flat baseline:** AI MAE was **1.29 minutes** (RMSE `1.88 min`, `91.67%` within `±3 min`, `100%` within `±5 min`) versus **6.58 minutes** for a flat 10-minute clinic average (**80.4% MAE reduction**) and **6.33 minutes** for the dataset mean (`14.25 min`).
- **Latency & reliability:** `24/24` live AI responses (`0` fallbacks), median latency (P50) `1,426 ms`, mean `2,045 ms`, P95 `4,800 ms`.
- **Safety check:** `0/24` outputs triggered diagnostic or medication-advice keyword flags.

**Known limitations (disclosed transparently):**
1. **Synthetic benchmark:** Current accuracy figures come from 24 synthetic cases modeled on Kediri clinic observations, not live clinical timestamps.
2. **Per-doctor pacing variation:** Different GPs consult at different speeds; live moving-average calibration using `predicted_minutes` vs. `actual_minutes` timestamps is scheduled for the Final Day phase.
3. **Network & free-tier rate limits:** Standard/free-tier Gemini keys enforce ~15 requests/minute and can experience occasional latency spikes above 4 seconds from Indonesia; KlinikFlow mitigates this with configurable timeouts (`6000-8000ms`) and automatic non-blocking fallback.

---

## 6. Short Copy-Paste Block (for README & Proposal Section 7)

> KlinikFlow uses Google's Gemini API (`gemini-3.5-flash-lite`, server-side only via `@google/genai`) strictly to estimate GP consultation duration (clamped to 5-25 minutes) and generate a 1-2 sentence neutral symptom summary for the doctor. The AI never diagnoses conditions, recommends medications, or reorders queue priority. No personally identifiable information (name, phone number, birth date, ticket ID, or doctor ID) is sent to the model; only the complaint text, optional age in years, and follow-up flag are transmitted. All outputs are schema-validated and fall back automatically to a configurable default duration (`10` minutes, clearly marked as `Estimasi standar` in the UI) on timeout or API failure. All development and benchmark datasets in this repository are 100% synthetic.
