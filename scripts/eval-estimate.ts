import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AgeGroup, EstimateInput, EstimateOutput, VisitPurpose } from "../src/lib/ai/estimate-core";

// Evaluates the consultation-duration estimator against the practising
// doctor's ranges (data/eval-complaints.json, expectedRange per case).
//
//   node scripts/eval-estimate.ts [--limit=N] [--delay=ms] [--baseline=5] [--dataset=...] [--out=...]
//
// Metrics (consultation minutes, without patient changeover):
//   - in-range rate: prediction inside the doctor's [lo, hi]
//   - MAE vs the range midpoint
//   - the same for a flat baseline (default 5 min, the new fallback)
//   - per-tier results, fallback count, latency, summary safety flags
//   - overlap check: no few-shot anchor in the prompt may resemble an eval case

type Tier = "short" | "mild" | "moderate" | "complex";

type EvalCase = {
  id: string;
  tier: Tier;
  complaint: string;
  ageGroup?: AgeGroup;
  visitPurpose?: VisitPurpose;
  isNewPatient?: boolean;
  hasChronicCondition?: boolean;
  expectedRange: [number, number];
  notes?: string;
};

type EvalDataset = {
  metadata: {
    name: string;
    version: string;
    synthetic: boolean;
    source: string;
    referenceRanges?: string;
    flatBaselineMinutes: number;
  };
  cases: EvalCase[];
};

type CaseResult = {
  id: string;
  tier: Tier;
  expectedRange: [number, number];
  midpoint: number;
  predictedMinutes: number;
  inRange: boolean;
  direction: "under" | "in" | "over";
  absErrorMidpoint: number;
  flatInRange: boolean;
  flatAbsErrorMidpoint: number;
  source: EstimateOutput["source"];
  confidence?: number;
  model?: string;
  summary?: string;
  latencyMs: number;
  safetyFlag: string | null;
  maxAnchorOverlap: number;
};

type Metrics = { n: number; inRangePct: number; inRangeCount: number; maeMidpoint: number; under: number; over: number };

const OVERLAP_LIMIT = 0.4; // Jaccard similarity of complaint words above which an anchor counts as a near-duplicate

const FORBIDDEN_SUMMARY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "diagnosis word", regex: /\b(diagnosis|diagnosa|menderita|terkena|kemungkinan besar)\b/i },
  {
    label: "medication advice",
    regex: /\b(minum obat|konsumsi obat|resepkan|paracetamol|amoxicillin|ibuprofen|antibiotik)\b/i,
  },
];

const STOPWORDS = new Set([
  "dan", "dengan", "sejak", "yang", "tidak", "untuk", "atau", "ada", "sudah", "masih", "agak", "sedikit", "terasa",
  "disertai", "setelah", "saat", "sering", "perlu", "bisa", "pasien", "the", "and", "since", "for", "with", "of",
]);

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

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function metricsFor(rows: Array<{ predicted: number; range: [number, number] }>): Metrics {
  const n = rows.length;
  if (n === 0) return { n: 0, inRangePct: 0, inRangeCount: 0, maeMidpoint: 0, under: 0, over: 0 };
  let inRange = 0;
  let under = 0;
  let over = 0;
  let sumAbs = 0;
  for (const { predicted, range } of rows) {
    const [lo, hi] = range;
    if (predicted < lo) under += 1;
    else if (predicted > hi) over += 1;
    else inRange += 1;
    sumAbs += Math.abs(predicted - (lo + hi) / 2);
  }
  return { n, inRangePct: round2((inRange / n) * 100), inRangeCount: inRange, maeMidpoint: round2(sumAbs / n), under, over };
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

  const datasetPath = path.resolve(process.cwd(), parseArgValue("--dataset=") ?? "data/eval-complaints.json");
  const outPath = path.resolve(process.cwd(), parseArgValue("--out=") ?? "data/eval-report.json");
  const delayMs = parsePositiveIntArg("--delay=", 400);

  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as EvalDataset;
  const limit = parsePositiveIntArg("--limit=", dataset.cases.length);
  const flatBaseline = parsePositiveIntArg("--baseline=", dataset.metadata.flatBaselineMinutes);
  const selectedCases = dataset.cases.slice(0, limit);

  const coreModuleUrl = pathToFileURL(path.resolve(process.cwd(), "src/lib/ai/estimate-core.ts")).href;
  const core = (await import(coreModuleUrl)) as {
    estimateConsultation: (input: EstimateInput) => Promise<EstimateOutput>;
    FEW_SHOT_EXAMPLES: Array<{ input: { complaint: string } }>;
  };

  // Anchors in the prompt must not resemble any eval case (otherwise the
  // benchmark partly measures memorisation of the prompt).
  const anchorWords = core.FEW_SHOT_EXAMPLES.map((e) => ({ complaint: e.input.complaint, words: words(e.input.complaint) }));
  const overlapRows = selectedCases.map((c) => {
    const w = words(c.complaint);
    let best = { score: 0, anchor: "" };
    for (const a of anchorWords) {
      const score = jaccard(w, a.words);
      if (score > best.score) best = { score, anchor: a.complaint };
    }
    return { id: c.id, maxOverlap: round2(best.score), closestAnchor: best.anchor };
  });
  const overlapping = overlapRows.filter((r) => r.maxOverlap >= OVERLAP_LIMIT);

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const modelLabel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite (default)";
  const timeoutLabel = process.env.GEMINI_TIMEOUT_MS?.trim() || "4000 (default)";

  console.log(`=== ${dataset.metadata.name} v${dataset.metadata.version} ===`);
  console.log(
    `Cases: ${selectedCases.length} | Model: ${modelLabel} | Timeout: ${timeoutLabel}ms | API Key: ${hasApiKey ? "configured" : "NOT SET"}`,
  );
  console.log(`Flat baseline: ${flatBaseline} min | Anchors in prompt: ${anchorWords.length}`);
  console.log(
    `Anchor overlap: max ${Math.max(...overlapRows.map((r) => r.maxOverlap))} (limit ${OVERLAP_LIMIT}); ${overlapping.length} case(s) over the limit\n`,
  );

  const results: CaseResult[] = [];

  for (let i = 0; i < selectedCases.length; i += 1) {
    const item = selectedCases[i];
    const [lo, hi] = item.expectedRange;
    const midpoint = (lo + hi) / 2;
    const started = Date.now();
    const output = await core.estimateConsultation({
      ticketId: `eval-${item.id}`,
      complaint: item.complaint,
      ageGroup: item.ageGroup,
      visitPurpose: item.visitPurpose,
      isNewPatient: item.isNewPatient,
      hasChronicCondition: item.hasChronicCondition,
      doctorId: "eval-doctor-01",
    });
    const latencyMs = Date.now() - started;
    const inRange = output.minutes >= lo && output.minutes <= hi;
    const safetyFlag = checkSummarySafety(output.summary);

    results.push({
      id: item.id,
      tier: item.tier,
      expectedRange: item.expectedRange,
      midpoint,
      predictedMinutes: output.minutes,
      inRange,
      direction: output.minutes < lo ? "under" : output.minutes > hi ? "over" : "in",
      absErrorMidpoint: round2(Math.abs(output.minutes - midpoint)),
      flatInRange: flatBaseline >= lo && flatBaseline <= hi,
      flatAbsErrorMidpoint: round2(Math.abs(flatBaseline - midpoint)),
      source: output.source,
      confidence: output.confidence,
      model: output.model,
      summary: output.summary,
      latencyMs,
      safetyFlag,
      maxAnchorOverlap: overlapRows[i].maxOverlap,
    });

    const flagNote = safetyFlag ? ` [SAFETY FLAG: ${safetyFlag}]` : "";
    console.log(
      `${item.id} [${item.tier.padEnd(8)}] range=${`${lo}-${hi}`.padStart(5)}m | ai=${String(output.minutes).padStart(2)}m ${inRange ? "IN " : output.minutes < lo ? "LOW" : "HIGH"} (${output.source.padEnd(8)}) | ${latencyMs}ms${flagNote}`,
    );

    if (i < selectedCases.length - 1 && hasApiKey && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const ai = metricsFor(results.map((r) => ({ predicted: r.predictedMinutes, range: r.expectedRange })));
  const flat = metricsFor(results.map((r) => ({ predicted: flatBaseline, range: r.expectedRange })));
  const aiOnlyResults = results.filter((r) => r.source === "ai");
  const aiOnly = metricsFor(aiOnlyResults.map((r) => ({ predicted: r.predictedMinutes, range: r.expectedRange })));

  // Held-out subset: the 7 cases that duplicated the OLD prompt anchors
  // (KF-01, 02, 07, 13, 14, 19, 22) reported separately for continuity.
  const formerOverlapIds = new Set(["KF-01", "KF-02", "KF-07", "KF-13", "KF-14", "KF-19", "KF-22"]);
  const formerOverlap = metricsFor(
    results.filter((r) => formerOverlapIds.has(r.id)).map((r) => ({ predicted: r.predictedMinutes, range: r.expectedRange })),
  );
  const others = metricsFor(
    results.filter((r) => !formerOverlapIds.has(r.id)).map((r) => ({ predicted: r.predictedMinutes, range: r.expectedRange })),
  );

  const tiers: Tier[] = ["short", "mild", "moderate", "complex"];
  const tierBreakdown = tiers.map((tier) => {
    const subset = results.filter((r) => r.tier === tier);
    const m = metricsFor(subset.map((r) => ({ predicted: r.predictedMinutes, range: r.expectedRange })));
    const f = metricsFor(subset.map((r) => ({ predicted: flatBaseline, range: r.expectedRange })));
    return {
      tier,
      range: subset[0]?.expectedRange ?? null,
      count: subset.length,
      predictions: subset.map((r) => r.predictedMinutes),
      ai: m,
      flatBaseline: f,
    };
  });

  const latencies = results.map((r) => r.latencyMs);
  const aiLatencies = aiOnlyResults.map((r) => r.latencyMs);
  const safetyFlags = results.filter((r) => r.safetyFlag !== null);

  console.log("\n=== Aggregate (consultation minutes vs the doctor's ranges) ===");
  console.log(`AI estimator:      in range ${ai.inRangeCount}/${ai.n} (${ai.inRangePct}%) | MAE vs midpoint ${ai.maeMidpoint}m | under ${ai.under}, over ${ai.over}`);
  if (aiOnly.n !== ai.n) {
    console.log(`AI (AI-only ${aiOnly.n}):   in range ${aiOnly.inRangeCount}/${aiOnly.n} (${aiOnly.inRangePct}%) | MAE vs midpoint ${aiOnly.maeMidpoint}m`);
  }
  console.log(`Flat ${flatBaseline} min:        in range ${flat.inRangeCount}/${flat.n} (${flat.inRangePct}%) | MAE vs midpoint ${flat.maeMidpoint}m`);
  console.log(`Former-overlap 7:  in range ${formerOverlap.inRangeCount}/${formerOverlap.n} | MAE ${formerOverlap.maeMidpoint}m  (other ${others.n}: in range ${others.inRangeCount}/${others.n}, MAE ${others.maeMidpoint}m)`);

  console.log("\n=== Per tier ===");
  for (const row of tierBreakdown) {
    console.log(
      `${row.tier.padEnd(8)} ${JSON.stringify(row.range).padEnd(7)} n=${row.count}: AI in range ${row.ai.inRangeCount}/${row.count}, MAE ${row.ai.maeMidpoint}m, predictions ${JSON.stringify(row.predictions)} | flat ${flatBaseline}: in range ${row.flatBaseline.inRangeCount}/${row.count}, MAE ${row.flatBaseline.maeMidpoint}m`,
    );
  }

  console.log("\n=== Reliability, latency, safety ===");
  console.log(`AI responses: ${aiOnlyResults.length}/${results.length} | Fallbacks: ${results.length - aiOnlyResults.length}/${results.length}`);
  console.log(
    `Latency (all): mean=${round2(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms | p50=${percentile(latencies, 50)}ms | p95=${percentile(latencies, 95)}ms`,
  );
  console.log(`Non-diagnostic safety flags: ${safetyFlags.length}/${results.length}`);

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: dataset.metadata,
    config: {
      model: modelLabel,
      timeoutMs: timeoutLabel,
      flatBaselineMinutes: flatBaseline,
      casesEvaluated: results.length,
      note: "Consultation minutes only (the queue adds QUEUE_CHANGEOVER_MINUTES on top). MAE is measured against the midpoint of each doctor range.",
    },
    anchorOverlap: {
      method: "Jaccard similarity of complaint words (stopwords removed) between each eval case and each prompt anchor",
      limit: OVERLAP_LIMIT,
      maxOverlap: Math.max(...overlapRows.map((r) => r.maxOverlap)),
      casesOverLimit: overlapping,
      perCase: overlapRows,
    },
    summary: {
      ai,
      aiOnly,
      flatBaseline: flat,
      formerOverlapCases: { ids: [...formerOverlapIds], ...formerOverlap },
      otherCases: others,
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
  if (overlapping.length > 0) {
    console.log(`WARNING: ${overlapping.length} eval case(s) resemble a prompt anchor (>= ${OVERLAP_LIMIT}).`);
    process.exitCode = 1;
  }
}

void main();
