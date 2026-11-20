import type { ReactNode } from "react";

// The perforated ticket (DESIGN.md signature move): a body, a dashed tear line
// with notched sides, and a stub. The stub can turn accent (your turn) or ink.
export function Ticket({
  children,
  stub,
  stubTone = "plain",
  className = "",
  label,
}: {
  children: ReactNode;
  stub?: ReactNode;
  stubTone?: "plain" | "accent" | "ink";
  className?: string;
  label?: string;
}) {
  return (
    <article aria-label={label} className={`ticket ${className}`.trim()}>
      <div className="ticket-body" data-solo={stub ? undefined : ""}>
        {children}
      </div>
      {stub ? (
        <div className="ticket-stub" data-tone={stubTone === "plain" ? undefined : stubTone}>
          {stub}
        </div>
      ) : null}
    </article>
  );
}

// Small mono label printed on tickets: "NOMOR ANTREAN", dates, codes.
export function PrintLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted ${className}`.trim()}>
      {children}
    </p>
  );
}
