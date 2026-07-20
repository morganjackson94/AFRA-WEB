"use client";

import { useState } from "react";
import { Check, ChevronDown } from "./Icons";

// Collapsed-by-default accordion box for one FAQ entry — saves vertical space
// on a section that used to render every answer open at once. Forwards
// unknown props (className/style/data-reveal-*) so Stagger's direct-child
// cloning for the reveal animation still works exactly as it did on the
// plain <div> this replaces.
export function FaqItem({
  q,
  a,
  ...rest
}: {
  q: string;
  a: string | string[];
} & React.HTMLAttributes<HTMLDivElement>) {
  const [open, setOpen] = useState(false);

  return (
    <div {...rest} className={`rounded-2xl border border-line bg-card px-6 py-6 ${rest.className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <b className="text-[16px] font-semibold">{q}</b>
        <ChevronDown
          className={`size-4 flex-none text-ink-soft transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-3">
          {Array.isArray(a) ? (
            <ul className="flex flex-col gap-2">
              {a.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-ink-soft">
                  <Check className="mt-0.5 size-[16px] flex-none text-ink-soft" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-soft">{a}</p>
          )}
        </div>
      )}
    </div>
  );
}
