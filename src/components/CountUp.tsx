"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";

// Counts a real number up from zero the first time it scrolls into view —
// used for the one sourced proof stat (58 candidates, docs/CLAIMS.md). The
// animation exists to pull the eye to the page's single piece of real
// evidence, nothing else on the page counts or ticks. Motion values only;
// reduced-motion users see the final number immediately.
export function CountUp({ to, className = "" }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const reduce = useReducedMotion();
  const raw = useMotionValue(0);
  const rounded = useTransform(raw, (v) => Math.round(v).toString());

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      raw.set(to);
      return;
    }
    const controls = animate(raw, to, { duration: 1.6, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, reduce, raw, to]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      <motion.span>{rounded}</motion.span>
    </span>
  );
}
