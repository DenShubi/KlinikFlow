"use client";

import { useEffect, useState } from "react";

function format(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Live mm:ss since a moment (e.g. consultation start). Turns amber once it
// runs past the predicted length, so the doctor sees the queue slipping.
export function ElapsedTimer({ since, predictedMinutes }: { since: string; predictedMinutes?: number | null }) {
  const start = Date.parse(since);
  const [now, setNow] = useState<number | null>(null);

  // The clock is read only in the browser (after hydration) to avoid a
  // server/client mismatch.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (now === null) return <span className="tabular-nums text-muted">–:––</span>;

  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const over = predictedMinutes != null && seconds > predictedMinutes * 60;

  return (
    <span className={`tabular-nums ${over ? "text-warn" : "text-ink"}`}>
      {format(seconds)}
      {predictedMinutes != null ? (
        <span className="text-muted"> / {predictedMinutes}:00</span>
      ) : null}
    </span>
  );
}
