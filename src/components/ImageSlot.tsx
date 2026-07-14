import { SectionLabel } from "./SectionLabel";

// Clearly-labeled placeholder for warm editorial photography (real café / hands /
// food) to be dropped in later. Designed so swapping in a real <img> completes
// the warmth — we do NOT invent fake imagery. `label` names what belongs here.
export function ImageSlot({
  label,
  caption,
  className = "",
  aspect = "aspect-[4/3]",
}: {
  label: string;
  caption?: string;
  className?: string;
  aspect?: string;
}) {
  return (
    <div
      className={`relative flex ${aspect} w-full items-end overflow-hidden rounded-2xl border border-line bg-cream ${className}`}
      data-image-slot
    >
      {/* subtle warm texture so the slot reads as intentional, not broken */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_30%_20%,rgba(240,232,216,0.04),rgba(240,232,216,0.08))]" />
      <div className="relative w-full p-5">
        <SectionLabel>Image · {label}</SectionLabel>
        {caption && <p className="mt-1.5 text-[13px] text-ink-soft">{caption}</p>}
      </div>
    </div>
  );
}
