// The Betak structural signpost — uppercase, letter-spaced, quiet, with real
// space above. Used identically across every surface (landing, dashboard,
// creative, onboarding) so the "architecture" reads consistently.
//
// `index` renders a numbered label (01 · LABEL) for the gallery/funnel feel.
// `tone="dark"` inverts color for the dark threshold (onboarding).

export function SectionLabel({
  children,
  index,
  tone = "light",
  className = "",
}: {
  children: React.ReactNode;
  index?: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div
      className={`t-label flex items-center gap-2.5 ${
        tone === "dark" ? "text-threshold-ink-soft" : ""
      } ${className}`}
    >
      {index && (
        <>
          <span className="tabular-nums">{index}</span>
          <span aria-hidden className={tone === "dark" ? "text-threshold-line" : "text-line-strong"}>
            ·
          </span>
        </>
      )}
      <span>{children}</span>
    </div>
  );
}
