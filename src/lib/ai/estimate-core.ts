import { GoogleGenAI, ThinkingLevel, Type, type ThinkingConfig } from "@google/genai";

export type EstimateInput = {
  ticketId: string; // server-side internal only; NEVER send to Gemini
  complaint: string; // free text from intake, Indonesian or English
  patientAgeYears?: number;
  isFollowUp?: boolean;
  doctorId?: string; // reserved for future calibration; NEVER send to Gemini
};

export type EstimateOutput = {
  minutes: number; // integer clamped strictly to 5..25
  source: "ai" | "fallback";
  confidence?: number; // 0..1
  summary?: string; // concise non-diagnostic summary for doctor card
  model?: string; // Gemini model id used
};

const MIN_MINUTES = 5;
const MAX_MINUTES = 25;
const DEFAULT_FALLBACK_MINUTES = 10;
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

const SYSTEM_INSTRUCTION = [
  "You are a primary clinic triage duration estimator for local Indonesian general practice clinics.",
  "You understand both Indonesian and English patient intake complaints.",
  "Your job is to:",
  "1. Estimate a realistic GP consultation duration in whole minutes between 5 and 25 (including ~2 minutes of room-turnover margin for entering, seating, and prescription notes).",
  "2. Write a concise 1-2 sentence neutral symptom summary for the doctor's card.",
  "3. Provide a confidence score between 0 and 1.",
  "",
  "CALIBRATION RULES (validated with local Indonesian clinic doctors):",
  "- Standard local clinic GP exams are typically under 10 minutes of diagnosis plus ~2 minutes of room turnover (around 8-12 minutes total for mild acute visits).",
  "- Follow-up visits (isFollowUp: true) are noticeably faster (around 5-7 minutes) unless a physical procedure like wound dressing or multi-symptom elderly review is needed.",
  "- You may output any whole integer from 5 to 25 (including intermediate values like 7, 13, 16, or 21) when a complaint falls between reference examples.",
  "",
  "STRICT SAFETY RULES:",
  "- NEVER diagnose diseases, name suspected conditions, or recommend medications/treatments.",
  "- Keep the summary strictly factual and descriptive of the patient's reported complaint.",
  "- Respond ONLY with JSON matching the requested schema.",
  "",
  "CALIBRATION EXAMPLES (observed local clinic durations):",
  '- Input: {"complaint":"Minta surat keterangan sehat untuk melamar kerja","isFollowUp":false} -> {"minutes":5,"confidence":0.92,"summary":"Pasien meminta surat keterangan sehat untuk keperluan melamar kerja tanpa keluhan akut."}',
  '- Input: {"complaint":"Cek tensi rutin dan kontrol singkat","isFollowUp":true} -> {"minutes":5,"confidence":0.9,"summary":"Kunjungan kontrol singkat untuk pemeriksaan tekanan darah rutin."}',
  '- Input: {"complaint":"Batuk pilek ringan sejak kemarin, tidak sesak","patientAgeYears":24,"isFollowUp":false} -> {"minutes":10,"confidence":0.85,"summary":"Pasien usia 24 tahun mengeluhkan batuk dan pilek ringan sejak 1 hari lalu tanpa sesak napas."}',
  '- Input: {"complaint":"Demam 2 hari dan sakit perut ringan","patientAgeYears":30,"isFollowUp":false} -> {"minutes":12,"confidence":0.82,"summary":"Pasien usia 30 tahun melaporkan demam selama 2 hari disertai keluhan sakit perut ringan."}',
  '- Input: {"complaint":"Demam tinggi sudah 4 hari disertai batuk dan agak sesak","patientAgeYears":35,"isFollowUp":false} -> {"minutes":18,"confidence":0.8,"summary":"Pasien usia 35 tahun mengalami demam tinggi lebih dari 3 hari disertai batuk dan keluhan napas terasa sesak."}',
  '- Input: {"complaint":"Anak demam sejak kemarin disertai muntah beberapa kali","patientAgeYears":6,"isFollowUp":false} -> {"minutes":18,"confidence":0.82,"summary":"Pasien anak usia 6 tahun dilaporkan mengalami demam sejak kemarin disertai muntah berulang."}',
  '- Input: {"complaint":"Perawatan luka pasca kecelakaan dan ganti perban di kaki","patientAgeYears":42,"isFollowUp":true} -> {"minutes":22,"confidence":0.86,"summary":"Kunjungan kontrol pasien usia 42 tahun untuk perawatan luka di kaki dan penggantian perban."}',
  '- Input: {"complaint":"Nyeri dada sejak pagi disertai sesak napas berat dan pusing","patientAgeYears":58,"isFollowUp":false} -> {"minutes":25,"confidence":0.88,"summary":"Pasien usia 58 tahun mengeluhkan nyeri dada sejak pagi disertai sesak napas berat dan pusing."}',
].join("\n");

const RESPONSE_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    minutes: {
      type: Type.INTEGER,
      description: "Estimated GP consultation duration in minutes, integer from 5 to 25.",
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

function getFallbackMinutes(): number {
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

export function buildSanitizedPromptPayload(input: EstimateInput): string {
  // Privacy guard: ONLY forward complaint, isFollowUp, and patientAgeYears.
  // Never include ticketId, doctorId, or any PII.
  const payload: {
    complaint: string;
    patientAgeYears?: number;
    isFollowUp?: boolean;
  } = {
    complaint: input.complaint.trim(),
  };

  if (
    typeof input.patientAgeYears === "number" &&
    Number.isFinite(input.patientAgeYears) &&
    input.patientAgeYears >= 0
  ) {
    payload.patientAgeYears = Math.round(input.patientAgeYears);
  }

  if (typeof input.isFollowUp === "boolean") {
    payload.isFollowUp = input.isFollowUp;
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
    const promptPayload = buildSanitizedPromptPayload({
      ticketId: "",
      complaint: trimmedComplaint,
      patientAgeYears: input.patientAgeYears,
      isFollowUp: input.isFollowUp,
    });

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
