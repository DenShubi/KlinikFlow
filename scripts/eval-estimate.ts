import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { EstimateInput, EstimateOutput } from "../src/lib/ai/estimate-core";

type Tier = "short" | "mild" | "moderate" | "complex";

type EvalCase = {
  id: string;
  tier: Tier;
  complaint: string;
  patientAgeYears?: number;
  isFollowUp?: boolean;
  expectedMinutes: number;
  notes?: string;
};

type EvalDataset = {
  metadata: {
    name: string;
    version: string;
    synthetic: boolean;
    source: string;
    flatBaselineMinutes: number;
  };
  cases: EvalCase[];
};

type CaseResult = {
  id: string;
  tier: Tier;
  expectedMinutes: number;
  predictedMinutes: number;
  absErrorAi: number;
  absErrorFlat: number;
  source: EstimateOutput["source"];
  confidence?: number;
  model?: string;
  summary?: string;
  latencyMs: number;
  safetyFlag: string | null;
};

type Metrics = {
  mae: number;
  rmse: number;
  within3Pct: number;
  within5Pct: number;
};

const FORBIDDEN_SUMMARY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "diagnosis word", regex: /\b(diagnosis|diagnosa|menderita|terkena|kemungkinan besar)\b/i },
  {
    label: "medication advice",
    regex: /\b(minum obat|konsumsi obat|resepkan|paracetamol|amoxicillin|ibuprofen|antibiotik)\b/i,
  },
];

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

function parseArgValue(prefix: string): string | null {
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parsePositiveIntArg(prefix: string, fallback: number): number {
  const raw = parseArgValue(prefix);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeMetrics(expected: number[], predicted: number[]): Metrics {
  const n = expected.length;
  if (n === 0) {
    return { mae: 0, rmse: 0, within3Pct: 0, within5Pct: 0 };
  }

  let sumAbs = 0;
  let sumSq = 0;
  let within3 = 0;
  let within5 = 0;

  for (let i = 0; i < n; i += 1) {
    const err = Math.abs(predicted[i] - expected[i]);
    sumAbs += err;
    sumSq += err * err;
    if (err <= 3) within3 += 1;
    if (err <= 5) within5 += 1;
  }

  return {
    mae: round2(sumAbs / n),
    rmse: round2(Math.sqrt(sumSq / n)),
    within3Pct: round2((within3 / n) * 100),
    within5Pct: round2((within5 / n) * 100),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function checkSummarySafety(summary?: string): string | null {
  if (!summary) return null;
  for (const rule of FORBIDDEN_SUMMARY_PATTERNS) {
    if (rule.regex.test(summary)) {
      return rule.label;
    }
  }
  return null;
}

async function main(): Promise<void> {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const datasetPath = path.resolve(
    process.cwd(),
    parseArgValue("--dataset=") ?? "data/eval-complaints.json",
  );
  const outPath = path.resolve(
    process.cwd(),
    parseArgValue("--out=") ?? "data/eval-report.json",
  );
  const delayMs = parsePositiveIntArg("--delay=", 400);

  const rawDataset = fs.readFileSync(datasetPath, "utf8");
  const dataset = JSON.parse(rawDataset) as EvalDataset;
  const limit = parsePositiveIntArg("--limit=", dataset.cases.length);
  const flatBaseline = parsePositiveIntArg("--baseline=", dataset.metadata.flatBaselineMinutes);
  const selectedCases = dataset.cases.slice(0, limit);

  const coreModuleUrl = pathToFileURL(
    path.resolve(process.cwd(), "src/lib/ai/estimate-core.ts"),
  ).href;
  const { estimateConsultation } = (await import(coreModuleUrl)) as {
    estimateConsultation: (input: EstimateInput) => Promise<EstimateOutput>;
  };

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const modelLabel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite (default)";
  const timeoutLabel = process.env.GEMINI_TIMEOUT_MS?.trim() || "4000 (default)";

  console.log(`=== ${dataset.metadata.name} ===`);
  console.log(
    `Cases: ${selectedCases.length} | Model: ${modelLabel} | Timeout: ${timeoutLabel}ms | API Key: ${hasApiKey ? "configured" : "NOT SET"}`,
  );
  console.log(`Flat baseline: ${flatBaseline} min\n`);

  const results: CaseResult[] = [];

  for (let i = 0; i < selectedCases.length; i += 1) {
    const item = selectedCases[i];
    const started = Date.now();
    const output = await estimateConsultation({
      ticketId: `eval-${item.id}`,
      complaint: item.complaint,
      patientAgeYears: item.patientAgeYears,
      isFollowUp: item.isFollowUp,
      doctorId: "eval-doctor-01",
    });
    const latencyMs = Date.now() - started;

    const absErrorAi = Math.abs(output.minutes - item.expectedMinutes);
    const absErrorFlat = Math.abs(flatBaseline - item.expectedMinutes);
    const safetyFlag = checkSummarySafety(output.summary);

    results.push({
      id: item.id,
      tier: item.tier,
      expectedMinutes: item.expectedMinutes,
      predictedMinutes: output.minutes,
      absErrorAi,
      absErrorFlat,
      source: output.source,
      confidence: output.confidence,
      model: output.model,
      summary: output.summary,
      latencyMs,
      safetyFlag,
    });

    const flagNote = safetyFlag ? ` [SAFETY FLAG: ${safetyFlag}]` : "";
    console.log(
      `${item.id} [${item.tier.padEnd(8)}] expected=${String(item.expectedMinutes).padStart(2)}m | ai=${String(output.minutes).padStart(2)}m (${output.source.padEnd(8)}) | err=${String(absErrorAi).padStart(2)}m vs flat=${String(absErrorFlat).padStart(2)}m | ${latencyMs}ms${flagNote}`,
    );

    if (i < selectedCases.length - 1 && hasApiKey && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const expectedArr = results.map((r) => r.expectedMinutes);
  const aiArr = results.map((r) => r.predictedMinutes);
  const flatArr = results.map(() => flatBaseline);
  const datasetMean = round2(expectedArr.reduce((a, b) => a + b, 0) / expectedArr.length);
  const meanArr = results.map(() => datasetMean);

  const aiMetrics = computeMetrics(expectedArr, aiArr);
  const flatMetrics = computeMetrics(expectedArr, flatArr);
  const meanMetrics = computeMetrics(expectedArr, meanArr);

  const aiOnlyResults = results.filter((r) => r.source === "ai");
  const aiOnlyMetrics = computeMetrics(
    aiOnlyResults.map((r) => r.expectedMinutes),
    aiOnlyResults.map((r) => r.predictedMinutes),
  );

  const maeImprovementVsFlatPct =
    flatMetrics.mae > 0 ? round2(((flatMetrics.mae - aiMetrics.mae) / flatMetrics.mae) * 100) : 0;

  const latencies = results.map((r) => r.latencyMs);
  const aiLatencies = aiOnlyResults.map((r) => r.latencyMs);
  const safetyFlags = results.filter((r) => r.safetyFlag !== null);

  const tiers: Tier[] = ["short", "mild", "moderate", "complex"];
  const tierBreakdown = tiers.map((tier) => {
    const subset = results.filter((r) => r.tier === tier);
    const metrics = computeMetrics(
      subset.map((r) => r.expectedMinutes),
      subset.map((r) => r.predictedMinutes),
    );
    const avgExpected =
      subset.length > 0
        ? round2(subset.reduce((sum, r) => sum + r.expectedMinutes, 0) / subset.length)
        : 0;
    const avgPredicted =
      subset.length > 0
        ? round2(subset.reduce((sum, r) => sum + r.predictedMinutes, 0) / subset.length)
        : 0;
    return {
      tier,
      count: subset.length,
      avgExpected,
      avgPredicted,
      mae: metrics.mae,
      within3Pct: metrics.within3Pct,
    };
  });

  console.log("\n=== Aggregate Comparison ===");
  console.log(
    `AI Estimator (all ${results.length}):    MAE=${aiMetrics.mae}m | RMSE=${aiMetrics.rmse}m | <=3m=${aiMetrics.within3Pct}% | <=5m=${aiMetrics.within5Pct}%`,
  );
  if (aiOnlyResults.length > 0 && aiOnlyResults.length < results.length) {
    console.log(
      `AI Estimator (AI-only ${aiOnlyResults.length}): MAE=${aiOnlyMetrics.mae}m | RMSE=${aiOnlyMetrics.rmse}m | <=3m=${aiOnlyMetrics.within3Pct}% | <=5m=${aiOnlyMetrics.within5Pct}%`,
    );
  }
  console.log(
    `Flat Baseline (${flatBaseline}m):       MAE=${flatMetrics.mae}m | RMSE=${flatMetrics.rmse}m | <=3m=${flatMetrics.within3Pct}% | <=5m=${flatMetrics.within5Pct}%`,
  );
  console.log(
    `Dataset Mean (${datasetMean}m):    MAE=${meanMetrics.mae}m | RMSE=${meanMetrics.rmse}m | <=3m=${meanMetrics.within3Pct}% | <=5m=${meanMetrics.within5Pct}%`,
  );
  console.log(`MAE Improvement vs Flat ${flatBaseline}m: ${maeImprovementVsFlatPct}%`);

  console.log("\n=== Per-Tier Breakdown ===");
  for (const row of tierBreakdown) {
    console.log(
      `${row.tier.padEnd(8)} (n=${row.count}): avgExpected=${row.avgExpected}m | avgPredicted=${row.avgPredicted}m | MAE=${row.mae}m | <=3m=${row.within3Pct}%`,
    );
  }

  console.log("\n=== Reliability, Latency & Safety ===");
  console.log(
    `AI responses: ${aiOnlyResults.length}/${results.length} (${round2((aiOnlyResults.length / results.length) * 100)}%) | Fallbacks: ${results.length - aiOnlyResults.length}/${results.length}`,
  );
  console.log(
    `Latency (all): mean=${round2(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms | p50=${percentile(latencies, 50)}ms | p95=${percentile(latencies, 95)}ms`,
  );
  if (aiLatencies.length > 0) {
    console.log(
      `Latency (AI):  mean=${round2(aiLatencies.reduce((a, b) => a + b, 0) / aiLatencies.length)}ms | p50=${percentile(aiLatencies, 50)}ms | p95=${percentile(aiLatencies, 95)}ms`,
    );
  }
  console.log(`Non-diagnostic safety flags: ${safetyFlags.length}/${results.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: dataset.metadata,
    config: {
      model: modelLabel,
      timeoutMs: timeoutLabel,
      flatBaselineMinutes: flatBaseline,
      datasetMeanMinutes: datasetMean,
      casesEvaluated: results.length,
    },
    summary: {
      aiAll: aiMetrics,
      aiOnly: aiOnlyMetrics,
      flatBaseline: flatMetrics,
      datasetMeanBaseline: meanMetrics,
      maeImprovementVsFlatPct,
      aiSuccessCount: aiOnlyResults.length,
      fallbackCount: results.length - aiOnlyResults.length,
      latencyAllMs: {
        mean: round2(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
      },
      latencyAiOnlyMs:
        aiLatencies.length > 0
          ? {
              mean: round2(aiLatencies.reduce((a, b) => a + b, 0) / aiLatencies.length),
              p50: percentile(aiLatencies, 50),
              p95: percentile(aiLatencies, 95),
            }
          : null,
      safetyFlagCount: safetyFlags.length,
    },
    tierBreakdown,
    results,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nSaved JSON report to ${path.relative(process.cwd(), outPath)}`);
}

void main();
