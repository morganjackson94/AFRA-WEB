import { SectionLabel } from "./SectionLabel";
import { PreviewTag } from "./PreviewTag";

// SAFE MODE — graceful degradation to a human. When the bot can't answer with
// confidence (ambiguous message, a question it shouldn't guess at, a degraded
// channel), it does NOT guess and does NOT go silent. It hands the applicant to
// the operator with full context and one calm action. Low confidence => human
// hand-off, never a silent failure, never a spammed applicant.
//
// Presentational for now: render it with sample props to preview the pattern.
// Wire to real low-confidence / needs-human signals later.
export function SafeModeHandoff({
  name,
  context,
  askedAt,
  action = "Reply to them",
  preview = false,
}: {
  name: string;
  /** The applicant's last message or why the bot stepped back. */
  context: string;
  /** Human-readable time, e.g. "11 minutes ago". */
  askedAt?: string;
  action?: string;
  preview?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-rose/40 bg-cream p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Needs you</SectionLabel>
        {preview && <PreviewTag />}
      </div>

      {/* The honest framing: we stepped back on purpose, here's the hand-off. */}
      <p className="t-heading mt-3 text-ink">We couldn&apos;t answer this one confidently.</p>
      <p className="mt-2 max-w-[54ch] text-sm leading-relaxed text-ink-soft">
        So we didn&apos;t guess. Here&apos;s the applicant and what they said. Reply once and we&apos;ll
        take it from there.
      </p>

      {/* The applicant + context, lifted so it reads as the thing to act on. */}
      <div className="mt-4 rounded-xl border border-line bg-card p-4">
        <p className="font-medium text-ink">{name}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">&ldquo;{context}&rdquo;</p>
        {askedAt && <p className="mt-2 text-xs text-faint">Asked {askedAt}</p>}
      </div>

      {/* One calm, one-tap action. Cream-on-periwinkle: clearly primary, not amber
          (amber stays the go-live moment), not an alarming red. */}
      <button className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg transition hover:opacity-90">
        {action}
      </button>
    </div>
  );
}
