// Small "Preview" marker for presentational states that aren't wired to live
// signals yet (safe mode, degraded banner, forced dashboard states). Keeps the
// honesty contract: nothing pretends to be real data when it's a preview.
export function PreviewTag() {
  return (
    <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-faint">
      Preview
    </span>
  );
}
