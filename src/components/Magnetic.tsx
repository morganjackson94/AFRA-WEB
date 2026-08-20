"use client";

import { useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";

// Magnetic wrapper for the hero's primary CTA: the button leans a few pixels
// toward the cursor and springs back on leave. Fine-pointer devices only —
// touch gets a plain wrapper, as do reduced-motion users. Motion values +
// springs exclusively; no React state per pointer move.
export function Magnetic({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });

  if (reduce) return <div className="inline-block">{children}</div>;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Lean up to ~8px toward the cursor, proportional to offset from center.
    x.set(((e.clientX - rect.left) / rect.width - 0.5) * 16);
    y.set(((e.clientY - rect.top) / rect.height - 0.5) * 12);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ x: sx, y: sy }}
      className="inline-block"
    >
      {children}
    </motion.div>
  );
}
