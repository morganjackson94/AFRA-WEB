"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { HERO_LINE_PATHS } from "./HeroLineArt";
import { Reveal } from "./Reveal";
import { Stagger } from "./Stagger";

// The how-it-works section with the café line-art woven into the story:
// as the visitor scrolls the three steps, the sketch draws itself stroke by
// stroke in a sticky column alongside — by the last step the café is fully
// drawn and "running". Scroll progress IS the animation clock (motivated:
// the drawing's completion mirrors the setup's completion), so there is no
// time-based cascade here. Motion values only; nothing re-renders per frame.
//
// Reduced motion: the sketch renders fully drawn, statically, and the rows
// keep their instant-reveal behavior from the shared Reveal CSS.

type Step = { n: string; h: string; p: string };

// Each stroke draws over a short window; windows are staggered across the
// scroll range so the cascade finishes just before the section releases.
function SketchPath({ d, index, count, progress }: { d: string; index: number; count: number; progress: MotionValue<number> }) {
  const start = (index / count) * 0.85;
  const dashoffset = useTransform(progress, [start, start + 0.15], [1, 0]);
  return (
    <motion.path
      d={d}
      pathLength={1}
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth={2}
      strokeLinecap="butt"
      strokeDasharray={1}
      style={{ strokeDashoffset: dashoffset }}
    />
  );
}

export function StepsSketch({ title, steps }: { title: string; steps: Step[] }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    // Start drawing as the section approaches center-stage; finish as the
    // last row is read, so the completed café holds while the section exits.
    offset: ["start 0.75", "end 0.55"],
  });

  return (
    <section ref={ref} className="mx-auto max-w-[1120px] border-t border-line px-6 py-24 md:py-32">
      <Reveal>
        <h2 className="t-title mb-12 max-w-[18ch]">{title}</h2>
      </Reveal>
      <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <Stagger step={120}>
          {steps.map((s) => (
            <div
              key={s.n}
              className="grid grid-cols-[64px_1fr] gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 md:grid-cols-[110px_1fr]"
            >
              <div className="t-numeral text-4xl text-faint md:text-5xl">{s.n}</div>
              <div>
                <h3 className="t-heading">{s.h}</h3>
                <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">{s.p}</p>
              </div>
            </div>
          ))}
        </Stagger>

        <div className="md:sticky md:top-28">
          <svg
            // Cropped ~1.5x tighter than the source viewBox (0 0 1035 455),
            // centered on the artwork's bounding box — same crop as
            // HeroLineArt, same source strokes.
            viewBox="342 -9 690 456"
            className="h-auto w-full"
            role="img"
            aria-label="Line illustration of a Dallas café counter, drawing itself in as the steps complete"
          >
            {reduce
              ? HERO_LINE_PATHS.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="butt" />
                ))
              : HERO_LINE_PATHS.map((d, i) => (
                  <SketchPath key={i} d={d} index={i} count={HERO_LINE_PATHS.length} progress={scrollYProgress} />
                ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
