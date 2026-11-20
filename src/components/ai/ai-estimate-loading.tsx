export type AiEstimateLoadingProps = {
  label?: string;
  sublabel?: string;
  compact?: boolean;
  className?: string;
};

export function AiEstimateLoading({
  label = "Menghitung estimasi durasi konsultasi...",
  sublabel = "Menganalisis keluhan pasien untuk memperkirakan waktu periksa.",
  compact = false,
  className = "",
}: AiEstimateLoadingProps) {
  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`inline-flex min-h-[32px] items-center gap-2 rounded-[8px] border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted ${className}`.trim()}
      >
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse motion-reduce:animate-none"
        />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`min-h-[96px] rounded-[12px] border border-line bg-canvas p-4 ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-accent"
        >
          <path
            d="M1.75 8.5H4.25L5.75 4.25L8.25 11.75L10.25 6.75L11.5 8.5H14.25"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs leading-[1.45] text-muted">{sublabel}</p>

          <div
            aria-hidden="true"
            className="h-1.5 w-full overflow-hidden rounded-full bg-tint"
          >
            <div className="h-full w-2/5 rounded-full bg-accent animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
