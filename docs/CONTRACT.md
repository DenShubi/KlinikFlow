# KlinikFlow — Schema and AI contract

> **Status: DRAFT, proposed by Denin on 20 Nov 2026.** Agree it with Farhan in the
> Team task, then change "DRAFT" to "AGREED" and the date. After that, change it
> only by telling each other first.

This is the one place where the queue (Denin) and the AI module (Farhan) meet:
one function, `estimateConsultation`, and the duration fields in the schema.

## 1. `estimateConsultation`

Server-side only (the Gemini key never reaches the browser). The queue engine
calls it when a ticket joins the queue; until integration (26 Nov) a stub
returns the fallback.

```ts
type EstimateInput = {
  ticketId: string;          // uuid of the queue ticket
  complaint: string;         // free text from intake, Indonesian or English
  patientAgeYears?: number;
  isFollowUp?: boolean;      // returning visit for the same problem
  doctorId?: string;         // lets calibration learn per doctor
};

type EstimateOutput = {
  minutes: number;           // predicted consultation length, integer 5..25
  source: "ai" | "fallback"; // "fallback" shows the fallback badge on screen
  confidence?: number;       // 0..1, optional
  summary?: string;          // short note for the doctor summary card
  model?: string;            // Gemini model id used, for the AI disclosure
};

export async function estimateConsultation(input: EstimateInput): Promise<EstimateOutput>;
```

Rules:

- Never throws. On any error or timeout (4 s) it returns
  `{ minutes: QUEUE_FALLBACK_CONSULT_MINUTES, source: "fallback" }`.
- Only `complaint`, `patientAgeYears` and `isFollowUp` are sent to Gemini;
  `ticketId`, `doctorId` and any patient identity stay on the server.
- File location: `src/lib/ai/estimate.ts`. Farhan owns that folder.

## 2. Schema fields

Both sides use table `public.queue_tickets` (one row per visit), created in
[`supabase/migrations/20261120080616_init_schema.sql`](../supabase/migrations/20261120080616_init_schema.sql).

**Input to `estimateConsultation`**

| Column | Type | Maps to |
| --- | --- | --- |
| `id` | `uuid` | `ticketId` |
| `complaint` | `text` | `complaint` |
| `is_follow_up` | `boolean` | `isFollowUp` |
| `patients.birth_date` (via `patient_id`) | `date` | `patientAgeYears`, computed by the queue engine |
| `doctor_id` | `uuid` | `doctorId` |

**Output of `estimateConsultation`**, saved by the queue engine when the ticket is created

| Column | Type | From |
| --- | --- | --- |
| `predicted_minutes` | `integer` (1..240) | `minutes` |
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
"AI estimator": `GEMINI_API_KEY`, `GEMINI_MODEL`, `QUEUE_FALLBACK_CONSULT_MINUTES`.

## Open questions

- [ ] Is `minutes` enough, or does the queue also need a range (min/max)?
- [ ] Which intake fields does the AI need beyond `complaint`?
- [x] Timeout value for the AI call: 4 s (in `estimate-core.ts`).
