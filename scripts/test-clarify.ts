import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ClarifyOutput } from "../src/lib/ai/clarify-core";

function loadEnvFile(filename: string): void {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

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

const TEST_COMPLAINTS = [
  "kepala cenat cenut",
  "telinga berdenging sebelah kanan sejak kemarin malam",
  "lutut kiri terasa nyeri dan bunyi klik saat naik tangga",
  "minta surat keterangan sehat untuk melamar kerja",
];

async function main(): Promise<void> {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  process.env.DEBUG_AI_ESTIMATE = "1";

  const moduleUrl = pathToFileURL(
    path.resolve(process.cwd(), "src/lib/ai/clarify-core.ts"),
  ).href;
  const { clarifyComplaint } = (await import(moduleUrl)) as {
    clarifyComplaint: (complaint: string) => Promise<ClarifyOutput>;
  };

  console.log(
    `Testing clarifyComplaint (model: ${process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite"}, timeout: ${process.env.GEMINI_TIMEOUT_MS?.trim() || "4000"}ms)\n`,
  );

  for (const complaint of TEST_COMPLAINTS) {
    const started = Date.now();
    const result = await clarifyComplaint(complaint);
    const ms = Date.now() - started;

    console.log(`Complaint: "${complaint}" (${ms}ms, source=${result.source})`);
    if (result.questions.length === 0) {
      console.log("  -> (no follow-up questions needed)");
    } else {
      for (const q of result.questions) {
        console.log(`  - ${q.question} [${q.allowMultiple ? "multi" : "single"}]`);
        console.log(`    Options: ${q.options.join(" | ")}`);
      }
    }
    console.log("");
  }
}

void main();
