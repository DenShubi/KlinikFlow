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
  minutes: number;           // predicted consultation length, integer >= 1
  source: "ai" | "fallback"; // "fallback" shows the fallback badge on screen
  confidence?: number;       // 0..1, optional
  summary?: string;          // short note for the doctor summary card
  model?: string;            // Gemini model id used, for the AI disclosure
};

export async function estimateConsultation(input: EstimateInput): Promise<EstimateOutput>;
```

Rules:

- Never throws. On any error or timeout (proposed: 4 s) it returns
  `{ minutes: QUEUE_FALLBACK_CONSULT_MINUTES, source: "fallback" }`.
- File location (proposed): `src/lib/ai/estimate.ts`. Farhan owns that folder.

## 2. Duration fields in the schema

Proposed columns on the consultation/ticket row (the full schema lands in the
migrations task, 22 Nov):

| Column | Type | Written by | Read by |
| --- | --- | --- | --- |
| `predicted_minutes` | `integer` | queue engine, from `estimateConsultation` | screens, calibration |
| `prediction_source` | `text` (`ai` / `fallback`) | queue engine | screens (fallback badge) |
| `started_at` | `timestamptz` | queue engine on "call next" | calibration |
| `ended_at` | `timestamptz` | queue engine when the consultation ends | calibration |
| `actual_minutes` | `integer`, generated from `ended_at - started_at` | database | calibration |

## 3. Environment variables

The names Farhan needs are in [`.env.example`](../.env.example), under
"AI estimator": `GEMINI_API_KEY`, `GEMINI_MODEL`, `QUEUE_FALLBACK_CONSULT_MINUTES`.

## Open questions

- [ ] Is `minutes` enough, or does the queue also need a range (min/max)?
- [ ] Which intake fields does the AI need beyond `complaint`?
- [ ] Timeout value for the AI call.
