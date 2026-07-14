"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";

// Sequenced reveal: when the container enters the viewport, its DIRECT children
// arrive one after another (not together) — the luxury signal. Each child gets
// `data-reveal` + an incremental transition-delay (the slow 900ms motion is in
// globals.css). Children are cloned (not wrapped) so grid/flex layout is preserved.
//
// `className` makes Stagger itself the layout container (e.g. a grid). `step` is
// the per-child delay in ms (80–120 = editorial). `base` offsets the whole group.
// `hero` gives the FIRST child the pronounced blur-in settle.

type RevealProps = {
  className?: string;
  style?: React.CSSProperties;
  [dataAttr: string]: unknown;
};

export function Stagger({
  children,
  className = "",
  step = 110,
  base = 0,
  hero = false,
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
  base?: number;
  hero?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const kids = Children.toArray(children);

  return (
    <div ref={ref} className={className}>
      {kids.map((child, i) => {
        if (!isValidElement(child)) return child;
        const el = child as React.ReactElement<RevealProps>;
        const attr = i === 0 && hero ? "data-reveal-hero" : "data-reveal";
        const props: RevealProps = {
          className: `${el.props.className ?? ""} ${visible ? "is-visible" : ""}`.trim(),
          style: { ...el.props.style, transitionDelay: `${base + i * step}ms` },
          [attr]: "",
        };
        return cloneElement(el, props);
      })}
    </div>
  );
}
