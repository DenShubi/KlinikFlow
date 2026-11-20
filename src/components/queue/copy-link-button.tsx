"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

// Copies the current page link so the patient can keep their ticket.
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing useful to show beyond the URL bar.
    }
  }

  return (
    <button type="button" onClick={copy} className="btn btn-secondary w-full" aria-live="polite">
      {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
      {copied ? "Tautan tersalin" : "Salin tautan tiket"}
    </button>
  );
}
