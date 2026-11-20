import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { EstimateInput, EstimateOutput } from "../src/lib/ai/estimate-core";

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

  type TestCase = {
    name: string;
    input: EstimateInput;
    simulateMissingApiKey?: boolean;
    expectFallback?: boolean;
  };

  const TEST_CASES: TestCase[] = [
    {
      name: "1. Short follow-up / surat sehat (~5m)",
      input: {
        ticketId: "00000000-0000-0000-0000-000000000001",
        complaint: "Minta surat keterangan sehat dan cek tensi rutin",
        patientAgeYears: 27,
        isFollowUp: true,
        doctorId: "doc-internal-01",
      },
    },
    {
      name: "2. Mild cold/fever (~10-12m)",
      input: {
        ticketId: "00000000-0000-0000-0000-000000000002",
        complaint: "Batuk pilek ringan dan demam 1 hari",
        patientAgeYears: 31,
        isFollowUp: false,
        doctorId: "doc-internal-01",
      },
    },
    {
      name: "3. Complex respiratory / wound care (~20-25m)",
      input: {
        ticketId: "00000000-0000-0000-0000-000000000003",
        complaint: "Perawatan luka pasca kecelakaan di kaki, ganti perban, dan mengeluh sesak napas",
        patientAgeYears: 54,
        isFollowUp: false,
        doctorId: "doc-internal-02",
      },
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

  async function main(): Promise<void> {
    loadEnvLocal();

    const coreModuleUrl = pathToFileURL(
      path.resolve(process.cwd(), "src/lib/ai/estimate-core.ts"),
    ).href;
    const { estimateConsultation } = (await import(coreModuleUrl)) as {
      estimateConsultation: (input: EstimateInput) => Promise<EstimateOutput>;
    };

    const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    console.log(
      `Running estimateConsultation tests (GEMINI_API_KEY ${hasApiKey ? "configured" : "not set"})\n`,
    );

    let failed = 0;

    for (const testCase of TEST_CASES) {
      const savedKey = process.env.GEMINI_API_KEY;
      if (testCase.simulateMissingApiKey) {
        delete process.env.GEMINI_API_KEY;
      }

      try {
        const started = Date.now();
        const result = await estimateConsultation(testCase.input);
        const elapsedMs = Date.now() - started;

        const minutesValid =
          Number.isInteger(result.minutes) && result.minutes >= 5 && result.minutes <= 25;
        const fallbackCheck = testCase.expectFallback ? result.source === "fallback" : true;
        const passed = minutesValid && fallbackCheck;

        if (!passed) {
          failed += 1;
        }

        console.log(`[${passed ? "PASS" : "FAIL"}] ${testCase.name} (${elapsedMs}ms)`);
        console.log(`  result: ${JSON.stringify(result)}`);
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

    console.log(`\nCompleted ${TEST_CASES.length} cases (${failed} failed).`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  }

  void main();
