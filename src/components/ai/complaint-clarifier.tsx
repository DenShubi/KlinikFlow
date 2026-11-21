"use client";

import { useEffect, useRef, useState } from "react";

import type { ClarifyQuestion } from "@/lib/ai/clarify-core";

export type ClarifierAnswers = Record<string, string[]>;

export const DURATION_OPTIONS = [
  "Baru hari ini",
  "2-3 hari",
  "Lebih dari seminggu",
] as const;

const ROUTINE_REGEX =
  /\b(surat sehat|surat keterangan|cek tensi|tensi rutin|ambil hasil|hasil lab)\b/i;

const FALLBACK_SYMPTOM_GROUPS: Array<{
  id: string;
  pattern: RegExp;
  question: string;
  options: string[];
}> = [
  {
    id: "headache",
    pattern: /\b(kepala|pusing|cenat|migra|nyut|pening|vertigo|headache|dizzy)\b/i,
    question: "Seperti apa rasa sakitnya?",
    options: ["Berdenyut", "Seperti ditekan", "Seperti ditusuk", "Pusing berputar", "Disertai mual"],
  },
  {
    id: "chest",
    pattern: /\b(dada|jantung|chest)\b/i,
    question: "Detail keluhan dada?",
    options: ["Seperti ditekan", "Sesak napas", "Keringat dingin", "Panas atau perih"],
  },
  {
    id: "wound",
    pattern: /\b(luka|perban|jatuh|teriris|robek|lecet|jahit|wound)\b/i,
    question: "Kondisi luka saat ini?",
    options: ["Perlu ganti perban", "Masih berdarah", "Bengkak / kemerahan", "Nyeri hebat"],
  },
  {
    id: "respiratory",
    pattern: /\b(batuk|pilek|flu|sesak|asma|mengi|tenggorokan|cough|cold)\b/i,
    question: "Detail keluhan napas / batuk?",
    options: ["Berdahak", "Batuk kering", "Agak sesak", "Nyeri menelan"],
  },
  {
    id: "fever",
    pattern: /\b(demam|panas|meriang|fever)\b/i,
    question: "Gejala penyerta demam?",
    options: ["Menggigil", "Mual / muntah", "Badan pegal", "Nafsu makan turun"],
  },
  {
    id: "stomach",
    pattern: /\b(perut|maag|lambung|mual|muntah|diare|mulas|mencret|stomach)\b/i,
    question: "Seperti apa keluhan perutnya?",
    options: ["Perih atau panas", "Mual / muntah", "Diare cair", "Kembung / begah"],
  },
  {
    id: "skin",
    pattern: /\b(gatal|ruam|bentol|alergi|kulit|biduran|rash)\b/i,
    question: "Detail keluhan kulit?",
    options: ["Bentol kemerahan", "Panas atau perih", "Menyebar luas", "Muncul setelah makan/obat"],
  },
];

export function buildFallbackQuestions(complaint: string): ClarifyQuestion[] {
  const trimmed = complaint.trim();
  if (trimmed.length < 3 || ROUTINE_REGEX.test(trimmed)) {
    return [];
  }

  const questions: ClarifyQuestion[] = [
    {
      id: "fallback-duration",
      question: "Sudah berapa lama?",
      options: [...DURATION_OPTIONS],
      allowMultiple: false,
    },
  ];

  for (const group of FALLBACK_SYMPTOM_GROUPS) {
    if (group.pattern.test(trimmed)) {
      questions.push({
        id: `fallback-${group.id}`,
        question: group.question,
        options: group.options,
        allowMultiple: true,
      });
      break;
    }
  }

  return questions;
}

export function buildEnrichedComplaintFromAnswers(
  baseComplaint: string,
  questions: ClarifyQuestion[],
  answers: ClarifierAnswers,
  maxLength = 500,
): string {
  const base = baseComplaint.trim();
  if (!base) return "";

  const parts: string[] = [];
  for (const q of questions) {
    const picked = answers[q.id];
    if (!picked || picked.length === 0) continue;
    const cleanQ = q.question.replace(/[?:]+$/g, "").trim();
    parts.push(`${cleanQ}: ${picked.join(", ")}`);
  }

  if (parts.length === 0) {
    return base.slice(0, maxLength);
  }

  return `${base} (${parts.join("; ")})`.slice(0, maxLength);
}

export type ComplaintClarifierProps = {
  complaint: string;
  questions: ClarifyQuestion[];
  answers: ClarifierAnswers;
  onQuestionsLoaded: (questions: ClarifyQuestion[]) => void;
  onToggleAnswer: (question: ClarifyQuestion, option: string) => void;
};

export function ComplaintClarifier({
  complaint,
  questions,
  answers,
  onQuestionsLoaded,
  onToggleAnswer,
}: ComplaintClarifierProps) {
  const [loading, setLoading] = useState(false);
  const [lastAskedComplaint, setLastAskedComplaint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = complaint.trim();
  const isEligible = trimmed.length >= 3 && !ROUTINE_REGEX.test(trimmed);
  const complaintChangedSinceAsk =
    lastAskedComplaint !== null && lastAskedComplaint !== trimmed;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!isEligible) {
    return null;
  }

  async function handleClarify() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch("/api/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint: trimmed }),
        signal: controller.signal,
      });

      if (!res.ok) {
        onQuestionsLoaded(buildFallbackQuestions(trimmed));
        setLastAskedComplaint(trimmed);
        return;
      }

      const data = (await res.json()) as {
        questions?: ClarifyQuestion[];
        source?: "ai" | "fallback";
      };

      if (Array.isArray(data.questions) && data.questions.length > 0) {
        onQuestionsLoaded(data.questions);
      } else if (data.source === "fallback") {
        onQuestionsLoaded(buildFallbackQuestions(trimmed));
      } else {
        onQuestionsLoaded([]);
      }
      setLastAskedComplaint(trimmed);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      onQuestionsLoaded(buildFallbackQuestions(trimmed));
      setLastAskedComplaint(trimmed);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void handleClarify()}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-[10px] bg-tint px-3.5 py-2 text-xs font-semibold text-accent-strong transition-colors hover:bg-[#e2e4fb] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {loading ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-strong/30 border-t-accent-strong motion-reduce:animate-none"
              />
              Menyiapkan pertanyaan lanjutan…
            </>
          ) : questions.length > 0 && !complaintChangedSinceAsk ? (
            "Muat ulang pertanyaan"
          ) : (
            "Bantu perjelas keluhan (opsional)"
          )}
        </button>

        {complaintChangedSinceAsk && questions.length > 0 ? (
          <span className="text-xs text-muted">Keluhan berubah, klik lagi untuk perbarui.</span>
        ) : null}
      </div>

      {questions.length > 0 ? (
        <div
          aria-label="Pertanyaan lanjutan keluhan (opsional)"
          className="flex flex-col gap-4 rounded-[14px] bg-canvas p-4 shadow-[inset_0_0_0_1px_var(--color-line-soft)]"
        >
          {questions.map((q) => {
            const selected = answers[q.id] ?? [];
            return (
              <div key={q.id} className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-ink">
                  {q.question}{" "}
                  <span className="font-normal text-muted">
                    {q.allowMultiple ? "(boleh pilih lebih dari satu)" : "(pilih satu)"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((option) => {
                    const active = selected.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onToggleAnswer(q, option)}
                        className={`min-h-[40px] cursor-pointer rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          active
                            ? "bg-accent text-white"
                            : "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tint"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
