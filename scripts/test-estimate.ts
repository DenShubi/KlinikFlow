import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { EstimateInput, EstimateOutput } from "../src/lib/ai/estimate-core";

type CoreModule = {
  estimateConsultation: (input: EstimateInput) => Promise<EstimateOutput>;
  buildSanitizedPromptPayload: (input: EstimateInput) => string;
  parseEstimateResponse: (
    rawText: string,
    modelId: string,
    trimmedComplaint: string,
  ) => EstimateOutput | null;
  getFallbackMinutes: () => number;
  ageGroupForYears: (years: number) => string | undefined;
  MIN_MINUTES: number;
  MAX_MINUTES: number;
  DEFAULT_FALLBACK_MINUTES: number;
};

function loadEnvFile(filename: string): void {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnvLocal(): void {
  // Match Next.js precedence: .env.local overrides .env
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

type IntegrationCase = {
  name: string;
  input: EstimateInput;
  expectedRange?: [number, number]; // consultation minutes, from the doctor's tiers
  simulateMissingApiKey?: boolean;
  expectFallback?: boolean;
};

// Expected ranges follow the practising doctor's tiers: routine 1-2 (clamped
// to 2), mild 2-3, moderate 5-20, complex/procedure 10-30 minutes.
const INTEGRATION_CASES: IntegrationCase[] = [
  {
    name: "1. Routine: certificate + BP check",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000001",
      complaint: "Minta surat keterangan sehat dan cek tensi rutin",
      ageGroup: "adult",
      visitPurpose: "certificate",
      doctorId: "doc-internal-01",
    },
    expectedRange: [2, 3],
  },
  {
    name: "2. Mild: cold and 1-day fever",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000002",
      complaint: "Batuk pilek ringan dan demam 1 hari",
      ageGroup: "adult",
      visitPurpose: "new_complaint",
      doctorId: "doc-internal-01",
    },
    expectedRange: [2, 3],
  },
  {
    name: "3. Complex: wound care + breathlessness (procedure)",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000003",
      complaint: "Perawatan luka pasca kecelakaan di kaki, ganti perban, dan mengeluh sesak napas",
      ageGroup: "adult",
      visitPurpose: "procedure",
      doctorId: "doc-internal-02",
    },
    expectedRange: [10, 30],
  },
  {
    name: "4. Empty string (immediate fallback)",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000004",
      complaint: "",
    },
    expectFallback: true,
  },
  {
    name: "5. Missing API key simulation (fallback without throwing)",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000005",
      complaint: "Demam tinggi 3 hari disertai batuk",
      ageGroup: "adult",
      visitPurpose: "new_complaint",
    },
    simulateMissingApiKey: true,
    expectFallback: true,
  },
];

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const saved = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

function runUnitChecks(core: CoreModule): { failed: number; total: number } {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // A. Privacy guard: IDs and personal data must never appear in the prompt.
  const payload = core.buildSanitizedPromptPayload({
    ticketId: "secret-ticket-999",
    complaint: "Batuk ringan",
    ageGroup: "adult",
    patientAgeYears: 29, // exact age must not be sent when the group is known
    visitPurpose: "follow_up",
    hasChronicCondition: true,
    doctorId: "secret-doctor-777",
    // Fields the estimator must drop even if a caller passes them by mistake.
    ...({ fullName: "Budi Santoso", phone: "+6281234567890", birthDate: "1997-02-03" } as object),
  } as EstimateInput);
  const forbidden = ["secret-ticket-999", "secret-doctor-777", "ticketId", "doctorId", "Budi", "+62812", "1997-02-03", "fullName", "phone", "birthDate", "patientAgeYears", "29"];
  checks.push({
    name: "Unit A. Privacy guard strips IDs, name, phone, birth date and exact age",
    pass: forbidden.every((f) => !payload.includes(f)) && payload.includes("Batuk ringan"),
    detail: payload,
  });

  // B. New inputs are forwarded; isFollowUp follows visitPurpose.
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const certificate = JSON.parse(
    core.buildSanitizedPromptPayload({ ticketId: "", complaint: "Surat sehat", visitPurpose: "certificate", isFollowUp: true }),
  ) as Record<string, unknown>;
  const legacy = JSON.parse(core.buildSanitizedPromptPayload({ ticketId: "", complaint: "Kontrol", isFollowUp: true })) as Record<string, unknown>;
  checks.push({
    name: "Unit B. visitPurpose, hasChronicCondition forwarded; isFollowUp derived",
    pass:
      parsed.visitPurpose === "follow_up" &&
      parsed.isFollowUp === true &&
      parsed.hasChronicCondition === true &&
      certificate.isFollowUp === false &&
      legacy.isFollowUp === true &&
      legacy.visitPurpose === undefined,
    detail: JSON.stringify({ parsed, certificate, legacy }),
  });

  // B2. Age group: forwarded as is, derived from a legacy age, invalid values dropped.
  const fromYears = JSON.parse(core.buildSanitizedPromptPayload({ ticketId: "", complaint: "Demam", patientAgeYears: 3 })) as Record<string, unknown>;
  const invalidGroup = JSON.parse(
    core.buildSanitizedPromptPayload({ ticketId: "", complaint: "Demam", ...({ ageGroup: "bayi" } as object) } as EstimateInput),
  ) as Record<string, unknown>;
  const bands = [0, 4, 5, 12, 13, 17, 18, 59, 60, 120].map((y) => core.ageGroupForYears(y)).join(",");
  checks.push({
    name: "Unit B2. ageGroup forwarded; legacy age mapped to its group; invalid group dropped",
    pass:
      parsed.ageGroup === "adult" &&
      fromYears.ageGroup === "toddler" &&
      !("patientAgeYears" in fromYears) &&
      invalidGroup.ageGroup === undefined &&
      bands === "toddler,toddler,child,child,teen,teen,adult,adult,elderly,elderly" &&
      core.ageGroupForYears(121) === undefined,
    detail: JSON.stringify({ fromYears, invalidGroup, bands }),
  });

  // C. Clamping lower bound (minutes < 2 -> 2, confidence < 0 -> 0)
  const low = core.parseEstimateResponse(
    JSON.stringify({ minutes: 0.6, confidence: -0.5, summary: "Kontrol singkat." }),
    "test-model",
    "Kontrol",
  );
  checks.push({
    name: `Unit C. Hard-clamps low values (minutes -> ${core.MIN_MINUTES}, confidence -> 0)`,
    pass: low !== null && low.minutes === 2 && core.MIN_MINUTES === 2 && low.confidence === 0 && low.model === "test-model",
    detail: JSON.stringify(low),
  });

  // D. Clamping upper bound (minutes > 30 -> 30, confidence > 1 -> 1)
  const high = core.parseEstimateResponse(
    JSON.stringify({ minutes: 99, confidence: 1.8, summary: "Keluhan kompleks." }),
    "test-model",
    "Keluhan kompleks",
  );
  checks.push({
    name: `Unit D. Hard-clamps high values (minutes -> ${core.MAX_MINUTES}, confidence -> 1)`,
    pass: high !== null && high.minutes === 30 && core.MAX_MINUTES === 30 && high.confidence === 1,
    detail: JSON.stringify(high),
  });

  // E. Malformed / invalid JSON returns null (triggers fallback)
  const invalidJson = core.parseEstimateResponse("{not-valid-json", "test-model", "Demam");
  const missingMinutes = core.parseEstimateResponse(
    JSON.stringify({ summary: "No minutes field" }),
    "test-model",
    "Demam",
  );
  checks.push({
    name: "Unit E. Invalid JSON / missing minutes returns null",
    pass: invalidJson === null && missingMinutes === null,
    detail: `invalidJson=${String(invalidJson)}, missingMinutes=${String(missingMinutes)}`,
  });

  // F. Fallback: 5 by default, configurable, clamped to the bounds.
  const byDefault = withEnv("QUEUE_FALLBACK_CONSULT_MINUTES", undefined, () => core.getFallbackMinutes());
  const configured = withEnv("QUEUE_FALLBACK_CONSULT_MINUTES", "8", () => core.getFallbackMinutes());
  const tooHigh = withEnv("QUEUE_FALLBACK_CONSULT_MINUTES", "99", () => core.getFallbackMinutes());
  checks.push({
    name: "Unit F. Fallback is 5 by default, env-configurable and clamped",
    pass: byDefault === 5 && core.DEFAULT_FALLBACK_MINUTES === 5 && configured === 8 && tooHigh === 30,
    detail: JSON.stringify({ byDefault, configured, tooHigh }),
  });

  console.log("=== Unit Checks ===");
  let failed = 0;
  for (const check of checks) {
    if (!check.pass) {
      failed += 1;
    }
    console.log(`[${check.pass ? "PASS" : "FAIL"}] ${check.name}`);
    if (!check.pass) {
      console.log(`  detail: ${check.detail}`);
    }
  }
  console.log("");
  return { failed, total: checks.length };
}

async function main(): Promise<void> {
  loadEnvLocal();
  process.env.DEBUG_AI_ESTIMATE = "1";

  const coreModuleUrl = pathToFileURL(
    path.resolve(process.cwd(), "src/lib/ai/estimate-core.ts"),
  ).href;
  const core = (await import(coreModuleUrl)) as CoreModule;

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const configuredModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite (default)";
  const fallbackMinutes = core.getFallbackMinutes();
  console.log(
    `Running estimateConsultation tests (GEMINI_API_KEY ${hasApiKey ? "configured" : "not set"}, model: ${configuredModel}, fallback: ${fallbackMinutes} min)\n`,
  );

  const unit = runUnitChecks(core);
  let failed = unit.failed;

  console.log("=== Integration / Contract Cases ===");
  for (const testCase of INTEGRATION_CASES) {
    const savedKey = process.env.GEMINI_API_KEY;
    if (testCase.simulateMissingApiKey) {
      delete process.env.GEMINI_API_KEY;
    }

    try {
      const started = Date.now();
      const result = await core.estimateConsultation(testCase.input);
      const elapsedMs = Date.now() - started;

      const reasons: string[] = [];

      if (!Number.isInteger(result.minutes) || result.minutes < core.MIN_MINUTES || result.minutes > core.MAX_MINUTES) {
        reasons.push(`minutes out of bounds (${core.MIN_MINUTES}..${core.MAX_MINUTES}): ${result.minutes}`);
      }

      if (testCase.expectFallback) {
        if (result.source !== "fallback") {
          reasons.push(`expected source="fallback", got "${result.source}"`);
        }
        if (result.minutes !== fallbackMinutes) {
          reasons.push(`expected fallback ${fallbackMinutes} min, got ${result.minutes}`);
        }
        if (elapsedMs > 250) {
          reasons.push(`expected immediate fallback (<250ms), took ${elapsedMs}ms`);
        }
      } else if (hasApiKey) {
        if (result.source !== "ai") {
          reasons.push(
            `expected source="ai" with GEMINI_API_KEY set, got "${result.source}" (likely timeout or API error)`,
          );
        } else {
          if (!result.model) {
            reasons.push("missing model field on AI response");
          }
          if (!result.summary || result.summary.trim().length === 0) {
            reasons.push("missing summary field on AI response");
          }
          if (testCase.expectedRange) {
            const [min, max] = testCase.expectedRange;
            if (result.minutes < min || result.minutes > max) {
              reasons.push(`expected ${min}..${max}m, got ${result.minutes}m`);
            }
          }
        }
      }

      const passed = reasons.length === 0;
      if (!passed) {
        failed += 1;
      }

      const rangeTag = testCase.expectedRange
        ? ` [expect ${testCase.expectedRange[0]}-${testCase.expectedRange[1]}m]`
        : "";
      console.log(`[${passed ? "PASS" : "FAIL"}] ${testCase.name}${rangeTag} (${elapsedMs}ms)`);
      console.log(`  result: ${JSON.stringify(result)}`);
      for (const reason of reasons) {
        console.log(`  reason: ${reason}`);
      }
    } finally {
      if (testCase.simulateMissingApiKey) {
        if (savedKey === undefined) {
          delete process.env.GEMINI_API_KEY;
        } else {
          process.env.GEMINI_API_KEY = savedKey;
        }
      }
    }
  }

  const total = unit.total + INTEGRATION_CASES.length;
  console.log(`\nSummary: ${total - failed}/${total} passed (${failed} failed).`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
