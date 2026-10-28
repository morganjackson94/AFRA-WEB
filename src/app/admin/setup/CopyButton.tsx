"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="min-h-11 rounded-full border border-line-strong px-4 text-[14px] font-medium text-ink hover:bg-card"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
