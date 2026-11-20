import type { EstimateOutput } from "@/lib/ai/estimate-core";

export type EstimateSourceBadgeProps = {
  source: EstimateOutput["source"];
  confidence?: number | null;
  showConfidence?: boolean;
  compact?: boolean;
  className?: string;
};

function formatConfidence(confidence?: number | null): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return null;
  }
  const clamped = Math.min(1, Math.max(0, confidence));
  return `${Math.round(clamped * 100)}%`;
}

export function EstimateSourceBadge({
  source,
  confidence,
  showConfidence = false,
  compact = false,
  className = "",
}: EstimateSourceBadgeProps) {
  const isAi = source === "ai";
  const confidenceText = isAi && showConfidence ? formatConfidence(confidence) : null;

  const containerClasses = isAi
    ? "border-tint-strong bg-tint text-accent-strong"
    : "border-warn-line bg-warn-soft text-warn";

  const paddingClasses = compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[8px] border font-medium leading-tight whitespace-nowrap ${containerClasses} ${paddingClasses} ${className}`.trim()}
    >
      {isAi ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-accent"
        >
          <path
            d="M1.75 8.5H4.25L5.75 4.25L8.25 11.75L10.25 6.75L11.5 8.5H14.25"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-warn"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 4.75V8L10.25 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <span>{isAi ? "Estimasi keluhan" : "Estimasi standar"}</span>

      {confidenceText ? (
        <span
          className="border-l border-tint-strong pl-1.5 font-normal tabular-nums text-accent-strong"
          title="Tingkat keyakinan estimasi"
        >
          {confidenceText}
        </span>
      ) : null}
    </span>
  );
}
