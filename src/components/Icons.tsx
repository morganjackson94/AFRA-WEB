// Line-icon set ported from the landing mockup's SVG symbols. Stroke uses
// currentColor; size via className (e.g. "size-5").

type Props = { className?: string };

const base = "stroke-current";
function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${base} ${className ?? "size-5"}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Check = (p: Props) => (
  <Svg {...p}>
    <polyline points="4 12 9 17 20 6" />
  </Svg>
);
export const Bolt = (p: Props) => (
  <Svg {...p}>
    <polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2" />
  </Svg>
);
export const Filter = (p: Props) => (
  <Svg {...p}>
    <polygon points="3 4 21 4 14 12 14 19 10 21 10 12 3 4" />
  </Svg>
);
export const Calendar = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="16" y1="2" x2="16" y2="6" />
  </Svg>
);
export const Bell = (p: Props) => (
  <Svg {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Svg>
);
export const Instagram = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
export const Microsoft = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" />
    <rect x="13" y="3" width="8" height="8" />
    <rect x="3" y="13" width="8" height="8" />
    <rect x="13" y="13" width="8" height="8" />
  </Svg>
);
export const Role = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </Svg>
);
export const Lock = (p: Props) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const ArrowLeft = (p: Props) => (
  <Svg {...p}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </Svg>
);
export const X = (p: Props) => (
  <Svg {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);
export const Play = ({ className }: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "size-6"} aria-hidden="true">
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);
