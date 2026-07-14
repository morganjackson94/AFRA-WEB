"use client";

import { useEffect, useRef, useState } from "react";

// Single-element editorial reveal: slow fade-up (900ms) as it enters the viewport,
// or the pronounced hero settle (1100ms + faint blur-in) with `hero`. Pass `delay`
// (ms) to sequence several Reveals into a stagger. Triggers once.
//
// The motion styling lives entirely inside prefers-reduced-motion:no-preference /
// reduce media queries in globals.css, so reduced-motion users get the final state
// immediately.
export function Reveal({
  children,
  className = "",
  delay = 0,
  hero = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const revealAttr = hero ? { "data-reveal-hero": "" } : { "data-reveal": "" };

  return (
    <div
      ref={ref}
      {...revealAttr}
      className={`${visible ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
