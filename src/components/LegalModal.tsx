"use client";

import { useEffect, useRef } from "react";
import { X } from "./Icons";
import { LegalMarkdown } from "./LegalMarkdown";

// ONE reusable modal for all legal documents — parameterized by title/content,
// not duplicated per document. Used by the footer (Terms/Privacy) and the
// checkout consent checkbox (same Terms/Privacy content, no third copy).

export function LegalModal({
  title,
  content,
  onClose,
}: {
  title: string;
  content: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the close button on open, restore focus to whatever triggered the
  // modal on close, and trap Tab/Shift+Tab inside the dialog while it's open.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        className="flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-2xl border border-line-strong bg-card shadow-[0_30px_60px_-20px_rgba(0,0,0,.5)]"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="legal-modal-title" className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 flex-none place-items-center rounded-lg text-ink-soft hover:bg-bg hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6">
          <LegalMarkdown content={content} />
        </div>
      </div>
    </div>
  );
}
