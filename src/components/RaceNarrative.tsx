"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";

// The problem story, told at scroll pace: a tall scroll container pins one
// viewport-height stage, and three phrases hand off to each other as the
// visitor scrolls through it. This is the page's single pinned moment (the
// redesign's storytelling centerpiece) — nothing else on the page hijacks
// scroll. Reduced-motion users get the three lines stacked statically with
// no pinning at all.
//
// Motion values only (useScroll/useTransform) — no React state per frame.

const PHRASES: { text: React.ReactNode; window: [number, number, number, number] }[] = [
  {
    text: <>A good applicant just messaged&nbsp;you.</>,
    window: [0.02, 0.1, 0.26, 0.34],
  },
  {
    text: <>They messaged four other places&nbsp;too.</>,
    window: [0.34, 0.42, 0.58, 0.66],
  },
  {
    // The last phrase fades out only across the final beat, so it dissolves
    // exactly as the pin releases into the coda below — never an empty stage.
    // Same-family italic for the emphasis word (the Garamond italic is the
    // Hermès-kit accent move), amber as this view's single accent moment.
    text: (
      <>
        Whoever answers <em className="text-accent">first</em> wins.
      </>
    ),
    window: [0.66, 0.74, 0.94, 1],
  },
];

function Phrase({
  progress,
  text,
  window: [inStart, inEnd, outStart, outEnd],
}: {
  progress: MotionValue<number>;
  text: React.ReactNode;
  window: [number, number, number, number];
}) {
  const opacity = useTransform(progress, [inStart, inEnd, outStart, outEnd], [0, 1, 1, 0]);
  const y = useTransform(progress, [inStart, inEnd, outStart, outEnd], [40, 0, 0, -40]);

  return (
    // The wrapper owns the true vertical centering (Motion's `y` would
    // otherwise replace the -translate-y-1/2 transform entirely).
    <div className="absolute inset-x-6 top-1/2 -translate-y-1/2">
      <motion.p style={{ opacity, y }} className="t-display text-center text-ink">
        {text}
      </motion.p>
    </div>
  );
}

export function RaceNarrative() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  if (reduce) {
    return (
      <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-6 py-28 text-center">
        {PHRASES.map((p, i) => (
          <p key={i} className="t-title text-ink">
            {p.text}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-[100dvh] items-center overflow-hidden">
        <div className="relative mx-auto h-full w-full max-w-[1080px]">
          {PHRASES.map((p, i) => (
            <Phrase key={i} progress={scrollYProgress} text={p.text} window={p.window} />
          ))}
        </div>
      </div>
    </div>
  );
}
