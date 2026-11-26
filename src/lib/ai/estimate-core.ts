import { GoogleGenAI, ThinkingLevel, Type, type ThinkingConfig } from "@google/genai";

// Why the patient is coming. Chosen on the intake form; never free text.
export const VISIT_PURPOSES = ["new_complaint", "follow_up", "routine_check", "certificate", "procedure"] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

// Age group chosen on the intake form (Indonesian health-ministry style bands).
// Only the group goes to the model, never an exact age or birth date.
//   toddler  balita, 0-4 years (includes babies)
//   child    anak, 5-12
//   teen     remaja, 13-17
//   adult    dewasa, 18-59
//   elderly  lansia, 60 and older
export const AGE_GROUPS = ["toddler", "child", "teen", "adult", "elderly"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

// For callers that only know an age in years (older tickets, the benchmark).
export function ageGroupForYears(years: number): AgeGroup | undefined {
  if (!Number.isFinite(years) || years < 0 || years > 120) return undefined;
  if (years < 5) return "toddler";
  if (years < 13) return "child";
  if (years < 18) return "teen";
  if (years < 60) return "adult";
  return "elderly";
}

export type EstimateInput = {
  ticketId: string; // server-side internal only; NEVER send to Gemini
  complaint: string; // free text from intake, Indonesian or English
  ageGroup?: AgeGroup; // from the intake form
  patientAgeYears?: number; // legacy; only its age group is sent, and only when ageGroup is missing
  isFollowUp?: boolean; // legacy flag; derived from visitPurpose when that is given
  visitPurpose?: VisitPurpose;
  hasChronicCondition?: boolean; // e.g. hypertension, diabetes (only the yes/no goes to the model)
  doctorId?: string; // reserved for future calibration; NEVER send to Gemini
};

export type EstimateOutput = {
  minutes: number; // consultation minutes, integer clamped to 2..30 (changeover is added by the queue)
  source: "ai" | "fallback";
  confidence?: number; // 0..1
  summary?: string; // concise non-diagnostic summary for doctor card
  model?: string; // Gemini model id used
};

// Bounds follow the practising doctor's tiers (routine 1-2, mild 2-3,
// moderate 5-20, complex/procedure 10-30 minutes). The lower bound is 2
// because a slot shorter than that is not useful for queue planning.
export const MIN_MINUTES = 2;
export const MAX_MINUTES = 30;
export const DEFAULT_FALLBACK_MINUTES = 5;
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 4000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 15000;
const MAX_FALLBACK_SUMMARY_LENGTH = 160;

let cachedClient: { apiKey: string; client: GoogleGenAI } | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (cachedClient && cachedClient.apiKey === apiKey) {
    return cachedClient.client;
  }
  const client = new GoogleGenAI({ apiKey });
  cachedClient = { apiKey, client };
  return client;
}

function getTimeoutMs(): number {
  const raw = process.env.GEMINI_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

type PromptPayload = {
  complaint: string;
  ageGroup?: AgeGroup;
  isFollowUp?: boolean;
  visitPurpose?: VisitPurpose;
  hasChronicCondition?: boolean;
};

// Few-shot anchors, one or two per tier of the doctor's guidance. They are
// written so that none of them resembles a case in data/eval-complaints.json
// (scripts/eval-estimate.ts checks the word overlap on every run).
export const FEW_SHOT_EXAMPLES: Array<{ input: PromptPayload; output: { minutes: number; confidence: number; summary: string } }> = [
  {
    input: { complaint: "Kontrol rutin asam urat, obat masih diminum, tidak ada keluhan", ageGroup: "elderly", visitPurpose: "routine_check", isFollowUp: false, hasChronicCondition: true },
    output: { minutes: 2, confidence: 0.9, summary: "Kontrol rutin asam urat dengan pengobatan berjalan dan tanpa keluhan baru." },
  },
  {
    input: { complaint: "Minta surat rujukan ke poli mata untuk periksa kacamata", ageGroup: "adult", visitPurpose: "certificate", isFollowUp: false },
    output: { minutes: 2, confidence: 0.88, summary: "Pasien meminta surat rujukan ke poli mata untuk pemeriksaan kacamata." },
  },
  {
    input: { complaint: "Sariawan di bibir bawah sejak 3 hari, perih saat makan", ageGroup: "adult", visitPurpose: "new_complaint", isFollowUp: false },
    output: { minutes: 3, confidence: 0.85, summary: "Pasien mengeluhkan sariawan di bibir bawah sejak 3 hari yang terasa perih saat makan." },
  },
  {
    input: { complaint: "Kepala pusing, pegal di bahu, dan susah tidur sejak seminggu", ageGroup: "adult", visitPurpose: "new_complaint", isFollowUp: false },
    output: { minutes: 7, confidence: 0.75, summary: "Pasien dengan tiga keluhan: pusing, pegal di bahu, dan sulit tidur sejak seminggu." },
  },
  {
    input: { complaint: "Muntah terus sejak subuh, tidak bisa minum, badan sangat lemas", ageGroup: "adult", visitPurpose: "new_complaint", isFollowUp: false },
    output: { minutes: 18, confidence: 0.75, summary: "Pasien muntah berulang sejak subuh, tidak bisa minum, dan merasa sangat lemas." },
  },
  {
    input: { complaint: "Telinga kiri sakit dan keluar cairan sejak kemarin, rewel terus", ageGroup: "toddler", visitPurpose: "new_complaint", isFollowUp: false },
    output: { minutes: 20, confidence: 0.72, summary: "Balita dengan nyeri telinga kiri dan keluar cairan sejak kemarin, rewel." },
  },
  {
    input: { complaint: "Cabut jahitan bekas operasi usus buntu", ageGroup: "adult", visitPurpose: "procedure", isFollowUp: false },
    output: { minutes: 12, confidence: 0.82, summary: "Tindakan pelepasan jahitan bekas operasi usus buntu." },
  },
  {
    input: { complaint: "Kaki bengkak dan sesak saat berbaring, punya sakit jantung dan ginjal", ageGroup: "elderly", visitPurpose: "new_complaint", isFollowUp: false, hasChronicCondition: true },
    output: { minutes: 25, confidence: 0.78, summary: "Pasien lansia dengan kaki bengkak dan sesak saat berbaring, memiliki penyakit jantung dan ginjal." },
  },
];

const SYSTEM_INSTRUCTION = [
  "You estimate how long a general practitioner in a small Indonesian clinic needs for one patient.",
  "You understand both Indonesian and English intake complaints.",
  "Your job is to:",
  `1. Estimate the doctor's consultation time in whole minutes between ${MIN_MINUTES} and ${MAX_MINUTES}. Do NOT add time for patients changing rooms; the clinic adds that separately.`,
  "2. Write a concise 1-2 sentence neutral summary of the reported complaint for the doctor's card.",
  "3. Provide a confidence score between 0 and 1.",
  "",
  "DURATION TIERS (from a practising GP in Kediri):",
  "- Routine (blood pressure check, stable medication control, routine labs, certificates or referrals): 1-2 minutes; answer 2.",
  "- Mild (mild cough or cold, fever for 1-2 days, mild gastritis, mild itch, small mouth ulcer): 2-3 minutes.",
  "- Moderate (high fever more than 3 days with cough or mild breathlessness, child with fever and vomiting, diarrhoea or vomiting with weakness): 5-20 minutes; up to 20 if an IV drip may be needed; toddlers (ageGroup toddler) up to about 30.",
  "- Complex or procedure (wound care, dressing change, stitches, elderly patient with several chronic complaints, chest pain or severe breathlessness): 10-30 minutes.",
  "",
  "AGE GROUPS (ageGroup): toddler 0-4 years, child 5-12, teen 13-17, adult 18-59, elderly 60 and older.",
  "",
  "ADJUSTMENTS:",
  "- Count the distinct problems. Symptoms of one illness (for example cough, runny nose and fever of a cold) are ONE problem. Each extra separate problem adds about 2 minutes.",
  "- Lengthen the estimate for ageGroup toddler and elderly, hasChronicCondition true, and procedures (visitPurpose procedure).",
  "- visitPurpose routine_check or certificate is usually routine; follow_up is usually routine or mild unless the complaint describes a procedure or a worsening problem.",
  "- When unsure between two values, choose the LOWER one. Overestimating makes patients waiting at home arrive late and miss their turn.",
  "",
  "STRICT SAFETY RULES:",
  "- NEVER diagnose diseases, name suspected conditions, or recommend medications/treatments.",
  "- Keep the summary strictly factual and descriptive of the patient's reported complaint.",
  "- Respond ONLY with JSON matching the requested schema.",
  "",
  "EXAMPLES:",
  ...FEW_SHOT_EXAMPLES.map((e) => `- Input: ${JSON.stringify(e.input)} -> ${JSON.stringify(e.output)}`),
].join("\n");

const RESPONSE_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    minutes: {
      type: Type.INTEGER,
      description: `Doctor's consultation time in minutes, integer from ${MIN_MINUTES} to ${MAX_MINUTES}, without patient changeover.`,
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score for the duration estimate, from 0 to 1.",
    },
    summary: {
      type: Type.STRING,
      description:
        "Concise 1-2 sentence neutral symptom summary for the doctor card. Never diagnose or suggest medication.",
    },
  },
  required: ["minutes", "confidence", "summary"],
  propertyOrdering: ["minutes", "confidence", "summary"],
};

function clampMinutes(value: number): number {
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Consultation minutes used when the AI is unavailable (env QUEUE_FALLBACK_CONSULT_MINUTES, default 5).
export function getFallbackMinutes(): number {
  const raw = process.env.QUEUE_FALLBACK_CONSULT_MINUTES;
  if (!raw) {
    return DEFAULT_FALLBACK_MINUTES;
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FALLBACK_MINUTES;
  }
  return clampMinutes(parsed);
}

function getModelId(): string {
  const raw = process.env.GEMINI_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_GEMINI_MODEL;
}

function getThinkingConfig(modelId: string): ThinkingConfig | undefined {
  if (modelId.startsWith("gemini-2.5-flash")) {
    return { thinkingBudget: 0 };
  }
  if (modelId.startsWith("gemini-3") || modelId.startsWith("gemini-4")) {
    return { thinkingLevel: ThinkingLevel.MINIMAL };
  }
  return undefined;
}

function buildFallback(trimmedComplaint: string, fallbackMinutes: number): EstimateOutput {
  return {
    minutes: fallbackMinutes,
    source: "fallback",
    summary: trimmedComplaint
      ? `Keluhan: ${trimmedComplaint.slice(0, MAX_FALLBACK_SUMMARY_LENGTH)}`
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgeGroup(value: unknown): value is AgeGroup {
  return typeof value === "string" && (AGE_GROUPS as readonly string[]).includes(value);
}

function isVisitPurpose(value: unknown): value is VisitPurpose {
  return typeof value === "string" && (VISIT_PURPOSES as readonly string[]).includes(value);
}

export function buildSanitizedPromptPayload(input: EstimateInput): string {
  // Privacy guard: ONLY forward the complaint and these coarse, non-identifying
  // fields. Never include ticketId, doctorId, a name, phone number, birth date
  // or an exact age (only the age group).
  const payload: PromptPayload = {
    complaint: input.complaint.trim(),
  };

  const ageGroup = isAgeGroup(input.ageGroup)
    ? input.ageGroup
    : typeof input.patientAgeYears === "number"
      ? ageGroupForYears(input.patientAgeYears)
      : undefined;
  if (ageGroup) {
    payload.ageGroup = ageGroup;
  }

  if (isVisitPurpose(input.visitPurpose)) {
    payload.visitPurpose = input.visitPurpose;
    // Backward compatibility: isFollowUp follows from the visit purpose.
    payload.isFollowUp = input.visitPurpose === "follow_up";
  } else if (typeof input.isFollowUp === "boolean") {
    payload.isFollowUp = input.isFollowUp;
  }

  if (typeof input.hasChronicCondition === "boolean") {
    payload.hasChronicCondition = input.hasChronicCondition;
  }

  return JSON.stringify(payload);
}

export function parseEstimateResponse(
  rawText: string,
  modelId: string,
  trimmedComplaint: string,
): EstimateOutput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const rawMinutes = parsed.minutes;
  if (typeof rawMinutes !== "number" || !Number.isFinite(rawMinutes)) {
    return null;
  }

  const minutes = clampMinutes(rawMinutes);

  const rawConfidence = parsed.confidence;
  const confidence =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? clampConfidence(rawConfidence)
      : undefined;

  const rawSummary = parsed.summary;
  const summary =
    typeof rawSummary === "string" && rawSummary.trim().length > 0
      ? rawSummary.trim()
      : `Keluhan: ${trimmedComplaint.slice(0, MAX_FALLBACK_SUMMARY_LENGTH)}`;

  return {
    minutes,
    source: "ai",
    confidence,
    summary,
    model: modelId,
  };
}

export async function estimateConsultation(input: EstimateInput): Promise<EstimateOutput> {
  const fallbackMinutes = getFallbackMinutes();
  const trimmedComplaint = typeof input?.complaint === "string" ? input.complaint.trim() : "";

  if (trimmedComplaint.length < 3) {
    return buildFallback(trimmedComplaint, fallbackMinutes);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return buildFallback(trimmedComplaint, fallbackMinutes);
  }

  const modelId = getModelId();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const ai = getClient(apiKey);
    const promptPayload = buildSanitizedPromptPayload({ ...input, ticketId: "", doctorId: undefined, complaint: trimmedComplaint });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gemini estimation request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const thinkingConfig = getThinkingConfig(modelId);
    const requestPromise = ai.models.generateContent({
      model: modelId,
      contents: promptPayload,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        maxOutputTokens: 1024,
        ...(thinkingConfig ? { thinkingConfig } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        abortSignal: controller.signal,
      },
    });

    const response = await Promise.race([requestPromise, timeoutPromise]);
    const text = response.text?.trim();
    if (!text) {
      if (process.env.DEBUG_AI_ESTIMATE === "1") {
        console.warn("[estimateConsultation] Empty response text from Gemini");
      }
      return buildFallback(trimmedComplaint, fallbackMinutes);
    }

    const validated = parseEstimateResponse(text, modelId, trimmedComplaint);
    if (!validated) {
      if (process.env.DEBUG_AI_ESTIMATE === "1") {
        console.warn("[estimateConsultation] Invalid JSON response from Gemini:", text.slice(0, 200));
      }
      return buildFallback(trimmedComplaint, fallbackMinutes);
    }

    return validated;
  } catch (err) {
    if (process.env.DEBUG_AI_ESTIMATE === "1") {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[estimateConsultation] Fallback triggered: ${msg}`);
    }
    return buildFallback(trimmedComplaint, fallbackMinutes);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
