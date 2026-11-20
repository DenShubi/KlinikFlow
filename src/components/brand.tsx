import Link from "next/link";

// Logo glyph: the queue ticket (notched sides) with a medical cross.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path
        fill="var(--color-accent)"
        d="M6 4h16a3 3 0 0 1 3 3v4.5a2.5 2.5 0 0 0 0 5V21a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-4.5a2.5 2.5 0 0 0 0-5V7a3 3 0 0 1 3-3z"
      />
      <path fill="#fff" d="M12.5 8.5h3v4h4v3h-4v4h-3v-4h-4v-3h4z" />
    </svg>
  );
}

export function Brand({ href = "/", size = 28 }: { href?: string; size?: number }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] text-[17px] font-bold tracking-[-0.02em] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <LogoMark size={size} />
      KlinikFlow
    </Link>
  );
}
