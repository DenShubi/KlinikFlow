import { GoogleGenAI, ThinkingLevel, Type, type ThinkingConfig } from "@google/genai";

export type ClarifyQuestion = {
  id: string;
  question: string;
  options: string[];
  allowMultiple: boolean;
};

export type ClarifyOutput = {
  questions: ClarifyQuestion[];
  source: "ai" | "fallback";
  model?: string;
};

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 4000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 15000;
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 5;

const ROUTINE_REGEX =
  /\b(surat sehat|surat keterangan|cek tensi|tensi rutin|ambil hasil|hasil lab)\b/i;

let cachedClient: { apiKey: string; client: GoogleGenAI } | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (cachedClient && cachedClient.apiKey === apiKey) {
    return cachedClient.client;
  }
  const client = new GoogleGenAI({ apiKey });
  cachedClient = { apiKey, client };
  return client;
}

function getModelId(): string {
  const raw = process.env.GEMINI_MODEL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_GEMINI_MODEL;
}

function getTimeoutMs(): number {
  const raw = process.env.GEMINI_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
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

const SYSTEM_INSTRUCTION = [
  "You are a friendly intake helper for a local Indonesian general practice clinic.",
  "A patient just typed a short free-text complaint before taking a queue number.",
  "Generate only as many short, practical multiple-choice follow-up questions as genuinely help the GP understand the complaint (between 0 and 4 questions: typically 1-2 for simple complaints, 3-4 for vague or multi-symptom complaints, covering things like how it feels, duration if not stated, location, triggers, or key accompanying symptoms).",
  "",
  "RULES:",
  "- Respond in the same language as the patient (usually everyday, natural Bahasa Indonesia).",
  "- Each question must be short (max 8 words) and easy for elderly or unwell patients to understand.",
  "- Each question must have 3 to 4 concise options (2 to 5 words each).",
  "- Do NOT ask about duration if the patient already stated how long it lasted.",
  "- If the visit is purely administrative (health certificate, routine check) or already very detailed, return an empty questions array [].",
  "- NEVER diagnose diseases, mention scary diagnoses (like stroke, cancer, heart attack), or recommend medications.",
  "- Respond ONLY with JSON matching the schema.",
].join("\n");

const RESPONSE_JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      description: "0 to 4 short intake clarification questions, scaled to how vague or complex the complaint is.",
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: "Short patient-friendly follow-up question in everyday language.",
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3 to 4 concise answer options (2 to 5 words each).",
          },
          allowMultiple: {
            type: Type.BOOLEAN,
            description: "True if the patient can pick multiple symptoms; false for single-choice like duration.",
          },
        },
        required: ["question", "options", "allowMultiple"],
        propertyOrdering: ["question", "options", "allowMultiple"],
      },
    },
  },
  required: ["questions"],
  propertyOrdering: ["questions"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseClarifyResponse(rawText: string, modelId: string): ClarifyOutput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) {
    return null;
  }

  const questions: ClarifyQuestion[] = [];
  for (let i = 0; i < parsed.questions.length && questions.length < MAX_QUESTIONS; i += 1) {
    const item = parsed.questions[i];
    if (!isRecord(item)) continue;

    const question = typeof item.question === "string" ? item.question.trim() : "";
    if (!question) continue;

    const rawOptions = Array.isArray(item.options) ? item.options : [];
    const options: string[] = [];
    for (const opt of rawOptions) {
      if (typeof opt !== "string") continue;
      const clean = opt.trim();
      if (clean && !options.includes(clean)) {
        options.push(clean);
      }
      if (options.length >= MAX_OPTIONS) break;
    }

    if (options.length < 2) continue;

    questions.push({
      id: `q-${questions.length + 1}`,
      question,
      options,
      allowMultiple: typeof item.allowMultiple === "boolean" ? item.allowMultiple : false,
    });
  }

  return {
    questions,
    source: "ai",
    model: modelId,
  };
}

export async function clarifyComplaint(complaint: string): Promise<ClarifyOutput> {
  const trimmed = typeof complaint === "string" ? complaint.trim().slice(0, 300) : "";

  if (trimmed.length < 3 || ROUTINE_REGEX.test(trimmed)) {
    return { questions: [], source: "fallback" };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { questions: [], source: "fallback" };
  }

  const modelId = getModelId();
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const ai = getClient(apiKey);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gemini clarify request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const thinkingConfig = getThinkingConfig(modelId);
    const requestPromise = ai.models.generateContent({
      model: modelId,
      contents: JSON.stringify({ complaint: trimmed }),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.3,
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
      return { questions: [], source: "fallback" };
    }

    const validated = parseClarifyResponse(text, modelId);
    return validated ?? { questions: [], source: "fallback" };
  } catch (err) {
    if (process.env.DEBUG_AI_ESTIMATE === "1") {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[clarifyComplaint] Fallback triggered: ${msg}`);
    }
    return { questions: [], source: "fallback" };
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
