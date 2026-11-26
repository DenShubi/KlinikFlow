# KlinikFlow — Schema and AI contract

> **Status: DRAFT, proposed by Denin on 20 Nov 2026.** Agree it with Farhan in the
> Team task, then change "DRAFT" to "AGREED" and the date. After that, change it
> only by telling each other first.

This is the one place where the queue (Denin) and the AI module (Farhan) meet:
one function, `estimateConsultation`, and the duration fields in the schema.

## 1. `estimateConsultation`

Server-side only (the Gemini key never reaches the browser). The queue engine
calls it when a ticket joins the queue, through `estimateForQueue` in
`src/lib/queue/estimator.ts`, which delegates to `estimateConsultation`
(integrated 20 Nov). Without `GEMINI_API_KEY` it returns the fallback.

```ts
type VisitPurpose = "new_complaint" | "follow_up" | "routine_check" | "certificate" | "procedure";
// balita 0-4, anak 5-12, remaja 13-17, dewasa 18-59, lansia 60+
type AgeGroup = "toddler" | "child" | "teen" | "adult" | "elderly";

type EstimateInput = {
  ticketId: string;              // uuid of the queue ticket (never sent to Gemini)
  complaint: string;             // free text from intake, Indonesian or English
  ageGroup?: AgeGroup;           // from the intake form
  patientAgeYears?: number;      // legacy; only its age group is sent, and only without ageGroup
  visitPurpose?: VisitPurpose;   // why the patient comes (intake form)
  isNewPatient?: boolean;        // first visit to this doctor
  hasChronicCondition?: boolean; // yes/no only, never the condition itself
  isFollowUp?: boolean;          // legacy; derived as visitPurpose === "follow_up" when visitPurpose is set
  doctorId?: string;             // lets calibration learn per doctor (never sent to Gemini)
};

type EstimateOutput = {
  minutes: number;           // consultation minutes, integer 2..30 (no changeover)
  source: "ai" | "fallback";
  confidence?: number;       // 0..1, optional
  summary?: string;          // short note for the doctor summary card
  model?: string;            // Gemini model id used, for the AI disclosure
};

export async function estimateConsultation(input: EstimateInput): Promise<EstimateOutput>;
```

Rules:

- Minutes follow a practising GP's tiers: routine 1-2, mild 2-3, moderate
  5-20 (toddlers up to about 30), complex or procedure 10-30. They are clamped
  to 2..30.
- Never throws. On any error or timeout (`GEMINI_TIMEOUT_MS`, default 4 s) it
  returns `{ minutes: QUEUE_FALLBACK_CONSULT_MINUTES (default 5), source: "fallback" }`.
- Only `complaint`, `ageGroup`, `visitPurpose`, `isNewPatient`,
  `hasChronicCondition` and `isFollowUp` are sent to Gemini; `ticketId`,
  `doctorId`, the name, phone number, birth date and any exact age stay on the server.
  Gender is not collected.
- `estimateForQueue` adds `QUEUE_CHANGEOVER_MINUTES` (default 1) for the next
  patient to come in. The queue stores that total slot as `predicted_minutes`.
- File location: `src/lib/ai/estimate.ts`. Farhan owns that folder.

## 2. Schema fields

Both sides use table `public.queue_tickets` (one row per visit), created in
[`supabase/migrations/20261120080616_init_schema.sql`](../supabase/migrations/20261120080616_init_schema.sql).

**Input to `estimateConsultation`**

| Column | Type | Maps to |
| --- | --- | --- |
| `id` | `uuid` | `ticketId` |
| `complaint` | `text` | `complaint` |
| `visit_purpose` | enum `visit_purpose` | `visitPurpose` |
| `is_new_patient` | `boolean` | `isNewPatient` |
| `has_chronic_condition` | `boolean` | `hasChronicCondition` |
| `age_group` | enum `age_group` | `ageGroup` (asked on the form; older rows: `patients.birth_date`) |
| `is_follow_up` | `boolean` | `isFollowUp` (= `visit_purpose = 'follow_up'`) |
| `doctor_id` | `uuid` | `doctorId` |

**Output of `estimateConsultation`**, saved by the queue engine when the ticket is created

| Column | Type | From |
| --- | --- | --- |
| `predicted_minutes` | `integer` (1..240) | `minutes` + `QUEUE_CHANGEOVER_MINUTES` (whole slot) |
| `prediction_source` | enum `ai` / `fallback` | `source` |
| `prediction_confidence` | `numeric(3,2)` (0..1) | `confidence` |
| `prediction_model` | `text` | `model` |
| `ai_summary` | `text` | `summary` |

**Actual duration** (read by calibration)

| Column | Type | Written by |
| --- | --- | --- |
| `started_at` | `timestamptz` | queue engine when the consultation starts |
| `ended_at` | `timestamptz` | queue engine when the consultation ends |
| `actual_minutes` | `numeric(6,2)`, generated from `ended_at - started_at` | database |

Calibration rows: `actual_minutes is not null` (index
`queue_tickets_calibration_idx`). The seed has about 600 finished visits over
the last two weeks. Seed rows with `prediction_source = 'ai'` have
`prediction_model = 'synthetic-seed'`, meaning the numbers are simulated, not
real Gemini output.

## 3. Environment variables

The names Farhan needs are in [`.env.example`](../.env.example), under
"AI estimator": `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`,
`QUEUE_FALLBACK_CONSULT_MINUTES` (default 5) and `QUEUE_CHANGEOVER_MINUTES` (default 1).

## Open questions

- [ ] Is `minutes` enough, or does the queue also need a range (min/max)?
- [x] Which intake fields does the AI need beyond `complaint`? Age group, visit
  purpose, new patient, chronic condition (26 Nov; migration `visit_details`).
- [ ] Do the doctor's ranges include patient changeover? Not confirmed; the
  queue adds `QUEUE_CHANGEOVER_MINUTES` on top until it is.
- [x] Timeout value for the AI call: 4 s (in `estimate-core.ts`).
