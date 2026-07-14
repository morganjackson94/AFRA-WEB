"use client";

import { useState } from "react";

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context) — select-and-copy fallback.
      const ok = window.prompt("Copy your hiring link:", url);
      void ok;
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded bg-cream px-2 py-1 text-xs">{url}</code>
      <button
        onClick={copy}
        className="shrink-0 rounded bg-ink px-3 py-1 text-xs font-medium text-bg hover:opacity-90"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
