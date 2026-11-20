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
  expectedRange?: [number, number];
  simulateMissingApiKey?: boolean;
  expectFallback?: boolean;
};

const INTEGRATION_CASES: IntegrationCase[] = [
  {
    name: "1. Short follow-up / surat sehat",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000001",
      complaint: "Minta surat keterangan sehat dan cek tensi rutin",
      patientAgeYears: 27,
      isFollowUp: true,
      doctorId: "doc-internal-01",
    },
    expectedRange: [5, 8],
  },
  {
    name: "2. Mild cold/fever",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000002",
      complaint: "Batuk pilek ringan dan demam 1 hari",
      patientAgeYears: 31,
      isFollowUp: false,
      doctorId: "doc-internal-01",
    },
    expectedRange: [8, 15],
  },
  {
    name: "3. Complex respiratory / wound care",
    input: {
      ticketId: "00000000-0000-0000-0000-000000000003",
      complaint: "Perawatan luka pasca kecelakaan di kaki, ganti perban, dan mengeluh sesak napas",
      patientAgeYears: 54,
      isFollowUp: false,
      doctorId: "doc-internal-02",
    },
    expectedRange: [18, 25],
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
      patientAgeYears: 22,
      isFollowUp: false,
    },
    simulateMissingApiKey: true,
    expectFallback: true,
  },
];

function runUnitChecks(core: CoreModule): number {
  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

  // 1. Privacy guard: ticketId & doctorId must never appear in serialized prompt
  const payload = core.buildSanitizedPromptPayload({
    ticketId: "secret-ticket-999",
    complaint: "Batuk ringan",
    patientAgeYears: 29,
    isFollowUp: true,
    doctorId: "secret-doctor-777",
  });
  const privacyPass =
    !payload.includes("secret-ticket-999") &&
    !payload.includes("secret-doctor-777") &&
    !payload.includes("ticketId") &&
    !payload.includes("doctorId") &&
    payload.includes("Batuk ringan");
  checks.push({
    name: "Unit A. Privacy guard strips ticketId and doctorId",
    pass: privacyPass,
    detail: payload,
  });

  // 2. Clamping lower bound (minutes < 5 -> 5, confidence < 0 -> 0)
  const low = core.parseEstimateResponse(
    JSON.stringify({ minutes: 1.2, confidence: -0.5, summary: "Kontrol singkat." }),
    "test-model",
    "Kontrol",
  );
  checks.push({
    name: "Unit B. Hard-clamps low values (minutes -> 5, confidence -> 0)",
    pass: low !== null && low.minutes === 5 && low.confidence === 0 && low.model === "test-model",
    detail: JSON.stringify(low),
  });

  // 3. Clamping upper bound (minutes > 25 -> 25, confidence > 1 -> 1)
  const high = core.parseEstimateResponse(
    JSON.stringify({ minutes: 99, confidence: 1.8, summary: "Keluhan kompleks." }),
    "test-model",
    "Keluhan kompleks",
  );
  checks.push({
    name: "Unit C. Hard-clamps high values (minutes -> 25, confidence -> 1)",
    pass: high !== null && high.minutes === 25 && high.confidence === 1,
    detail: JSON.stringify(high),
  });

  // 4. Malformed / invalid JSON returns null (triggers fallback)
  const invalidJson = core.parseEstimateResponse("{not-valid-json", "test-model", "Demam");
  const missingMinutes = core.parseEstimateResponse(
    JSON.stringify({ summary: "No minutes field" }),
    "test-model",
    "Demam",
  );
  checks.push({
    name: "Unit D. Invalid JSON / missing minutes returns null",
    pass: invalidJson === null && missingMinutes === null,
    detail: `invalidJson=${String(invalidJson)}, missingMinutes=${String(missingMinutes)}`,
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
  return failed;
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
  console.log(
    `Running estimateConsultation tests (GEMINI_API_KEY ${hasApiKey ? "configured" : "not set"}, model: ${configuredModel})\n`,
  );

  let failed = runUnitChecks(core);

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

      if (!Number.isInteger(result.minutes) || result.minutes < 5 || result.minutes > 25) {
        reasons.push(`minutes out of bounds (5..25): ${result.minutes}`);
      }

      if (testCase.expectFallback) {
        if (result.source !== "fallback") {
          reasons.push(`expected source="fallback", got "${result.source}"`);
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

  const total = 4 + INTEGRATION_CASES.length;
  console.log(`\nSummary: ${total - failed}/${total} passed (${failed} failed).`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
