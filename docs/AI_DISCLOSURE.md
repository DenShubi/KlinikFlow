# KlinikFlow AI Disclosure & Responsible Use Notes

This document describes how generative AI is used in KlinikFlow, what guardrails are enforced in code, and what limitations apply. It is written for both repository transparency (`README.md`) and **STACK 2026 Proposal Section 7 (AI Disclosure)**.

---

## 1. Role & Strict Boundaries of AI

KlinikFlow uses a server-side language model for **two narrow operational tasks** during queue intake (`src/lib/ai/estimate.ts`):

1. **Consultation duration estimation:** Predicts an expected general-practice consultation length as a whole number between **2 and 30 minutes** from the patient's complaint text and a few coarse intake answers (age group, visit purpose, whether this is a new patient, whether they have a chronic condition). The queue adds 1 minute of patient changeover (`QUEUE_CHANGEOVER_MINUTES`) on top.
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
| **Prompt Calibration** | System prompt built on the duration tiers given by a practising GP in Kediri (routine 1-2 min, mild 2-3, moderate 5-20 with toddlers up to about 30, complex or procedure 10-30), adjustment rules (count distinct problems, longer for toddlers, the elderly, chronic conditions and procedures; prefer the lower value when unsure) and 8 synthetic anchor examples that do not overlap the evaluation cases |
| **UI Transparency** | Following `DESIGN.md`, staff and patient screens do not show model, confidence or estimate-source labels. The source of every estimate (`ai` or `fallback`) and the model id are stored on the ticket (`prediction_source`, `prediction_model`) for audit. The doctor sees the summary with the note "Ringkasan otomatis, bukan diagnosis" |

---

## 3. Privacy & Data Minimization

- **Zero real patient data in repository:** All development, testing, and evaluation datasets (`data/eval-complaints.json`) are 100% synthetic.
- **Strict PII stripping before API calls:** `buildSanitizedPromptPayload` in `src/lib/ai/estimate-core.ts` forwards **only** `complaint`, the optional `ageGroup` (toddler 0-4, child 5-12, teen 13-17, adult 18-59, elderly 60+; an exact age is never sent, and an older caller's age in years is reduced to its group), optional `visitPurpose`, `isNewPatient`, `hasChronicCondition` (yes/no only, never the condition) and the derived `isFollowUp`. Patient names, phone numbers, birth dates, `ticketId`, and `doctorId` are never included in the Gemini payload (verified by automated unit check in `scripts/test-estimate.ts`, which also passes a name, phone, birth date and exact age on purpose and checks they are dropped).
- **Fewer personal fields collected:** the intake forms ask for an age group (*Balita, Anak, Remaja, Dewasa, Lansia*) instead of a birth date or exact age, and gender is not asked because research shows it has only a small effect on consultation length.
- **Role-based visibility:** Symptom summaries are designed exclusively for authenticated doctor views, separate from front-desk queue identity data.

---

## 4. Safety, Clamping & Fallback Resilience

- **Hard numeric bounds:** Parsed outputs are validated without unsafe type assertions. `minutes` is hard-clamped to integer `2..30` and `confidence` to `0..1`.
- **Non-throwing fallback:** `estimateConsultation` never throws. On empty/short complaints (`< 3` characters), missing `GEMINI_API_KEY`, invalid JSON, HTTP errors/rate limits, or timeout (`GEMINI_TIMEOUT_MS`, default `4000ms`, recommended `6000-8000ms` on clinic networks), it immediately returns the clinic default (`QUEUE_FALLBACK_CONSULT_MINUTES`, default `5` minutes) with `source: "fallback"`. The default was lowered from 10 because overestimating is the harmful direction: patients waiting at home arrive late and miss their turn.
- **Degraded-mode continuity:** If the AI service is offline or rate-limited, the clinic queue continues operating normally; the doctor still reads the patient's own complaint, and the fallback is recorded on the ticket (`prediction_source = 'fallback'`).

---

## 5. Evaluation Evidence & Known Limitations

Benchmarked on **24 synthetic Indonesian and English clinic cases** (`data/eval-complaints.json` v2.1, `scripts/eval-estimate.ts`, full output in `data/eval-report.json`) with `gemini-3.5-flash-lite` and `GEMINI_TIMEOUT_MS=8000`. Each case now has a **range** from the practising GP's tiers instead of a single reference number; scores are consultation minutes without changeover. Since v2.1 each case gives an age group, as the forms do, instead of an exact age.

- **In-range rate:** **21/24 (87.5%)** of AI estimates fall inside the doctor's range (routine 5/6, mild 4/6, moderate 6/6, complex 6/6). All three misses are over, not under: two mild complaints from new patients (4 and 5 minutes against 2-3) and a short follow-up to read lab results (3 minutes against 1-2).
- **Error:** mean absolute error against the range midpoint **1.96 min**, versus **7.13 min** for a flat 5-minute default (in range 6/24).
- **No overlap with the prompt:** the 8 anchor examples were rewritten; the closest anchor-to-case word overlap is 0.23 (checked on every run, limit 0.4). The 7 cases that duplicated the old anchors (KF-01, 02, 07, 13, 14, 19, 22) score 7/7 in range.
- **Latency & reliability:** `24/24` live AI responses (`0` fallbacks), median latency (P50) `4,321 ms`, P95 `5,567 ms`.
- **Safety check:** `0/24` summaries triggered diagnostic or medication-advice keyword flags.
- **Tuning disclosure:** after a first run (21/24 in range, MAE 2.38 min, one fallback) the prompt rules were adjusted once (symptoms of one illness count as one problem; a new patient adds about 1 minute) and the benchmark was run again. That second run, with exact ages, scored 22/24 in range and MAE 1.58 min. Switching the input to age groups changed no prompt rule; the run reported above scored one case fewer. A first run with age groups had 3 fallbacks within a second (20/21 in range among the live answers) and was repeated. The model's answers vary from run to run by about one case. The earlier numbers (MAE 1.29 min against single reference values) are not comparable because the reference changed from points to ranges.

**Known limitations (disclosed transparently):**
1. **Synthetic benchmark:** Current accuracy figures come from 24 synthetic cases scored against one doctor's ranges, not live clinical timestamps. The ranges themselves are wide (5-20 and 10-30 minutes), so in-range is an easier bar for moderate and complex visits than for routine and mild ones.
2. **Changeover not confirmed:** it is not yet confirmed whether the doctor's minutes include patient changeover; the queue adds 1 minute on top until it is.
3. **Per-doctor pacing variation:** Different GPs consult at different speeds; live moving-average calibration using `predicted_minutes` vs. `actual_minutes` timestamps is scheduled for the Final Day phase.
4. **Network & free-tier rate limits:** Standard/free-tier Gemini keys enforce ~15 requests/minute and can experience occasional latency spikes above 4 seconds from Indonesia; KlinikFlow mitigates this with configurable timeouts (`6000-8000ms`) and automatic non-blocking fallback.

---

## 6. Short Copy-Paste Block (for README & Proposal Section 7)

> KlinikFlow uses Google's Gemini API (`gemini-3.5-flash-lite`, server-side only via `@google/genai`) strictly to estimate GP consultation duration (clamped to 2-30 minutes, following a practising doctor's duration tiers) and generate a 1-2 sentence neutral symptom summary for the doctor. The AI never diagnoses conditions, recommends medications, or reorders queue priority. No personally identifiable information (name, phone number, birth date, ticket ID, or doctor ID) is sent to the model; only the complaint text, an age group, visit purpose, whether the patient is new, and a yes/no chronic-condition flag are transmitted. All outputs are schema-validated and fall back automatically to a configurable default duration (`5` minutes) on timeout or API failure, so the queue never blocks. On a 24-case synthetic benchmark, 21 of 24 estimates fell inside the doctor's ranges. All development and benchmark datasets in this repository are 100% synthetic.
