"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, X } from "../components/Icons";


// The overlay is portaled to <body> so it escapes transformed / will-change
// ancestors (e.g. the Reveal wrappers), which would otherwise become the
// containing block for `fixed` and clip the scrim short of the viewport.

export function DemoModal({ variant = "ghost" }: { variant?: "ghost" | "poster" }) {
  const [open, setOpen] = useState(false);
  const [previewInView, setPreviewInView] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const posterRef = useRef<HTMLButtonElement>(null);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // The poster preview loads/plays real video the moment it's mounted — fine
  // for the modal (opened deliberately), wasteful for the "poster" thumbnail,
  // which used to autoplay ~600KB of video on every page load regardless of
  // whether it was ever scrolled to. Gate it behind IntersectionObserver so
  // the <video> (and its network request) doesn't exist in the DOM until the
  // section is actually visible.
  useEffect(() => {
    if (variant !== "poster") return;
    const el = posterRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setPreviewInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPreviewInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [variant]);

  // Poster preview: starts from the video's midpoint (computed from actual
  // duration, not a hardcoded timestamp, so it stays correct if the file
  // changes) and loops from there — not from the top — so the thumbnail
  // always shows a moment of real product, not the cold open.
  function seekToMiddle() {
    const v = previewRef.current;
    if (v && v.duration) v.currentTime = v.duration / 2;
  }
  function loopFromMiddle() {
    const v = previewRef.current;
    if (!v) return;
    seekToMiddle();
    v.play().catch(() => {});
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex h-dvh w-screen items-center justify-center bg-[rgba(18,18,30,.85)] p-6"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="relative aspect-video w-full max-w-[880px] overflow-hidden rounded-2xl bg-[#1e1e33]">
        <button
          onClick={() => setOpen(false)}
          className="absolute -top-11 right-0 flex items-center gap-1.5 text-sm text-ink"
        >
          <X className="size-4" /> Close
        </button>
        {open && (
          <video
            src="/AFRA-VSL.mp4"
            controls
            autoPlay
            playsInline
            className="size-full"
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {variant === "ghost" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-line-strong px-6 py-3.5 text-base font-medium hover:border-ink"
        >
          <Play className="size-4" /> Watch 90-sec demo
        </button>
      ) : (
        <button
          ref={posterRef}
          onClick={() => setOpen(true)}
          className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-2xl border border-line-strong bg-[#1e1e33]"
        >
          {previewInView && (
            <video
              ref={previewRef}
              src="/AFRA-VSL.mp4"
              muted
              autoPlay
              loop={false}
              playsInline
              preload="auto"
              onLoadedMetadata={seekToMiddle}
              onEnded={loopFromMiddle}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {/* Scrim keeps the play button + text legible over live footage. */}
          <div className="absolute inset-0 grid place-items-center bg-[#1e1e33]/45">
            {/* The lit amber play button — this poster's single accent moment. */}
            <span className="grid size-[74px] place-items-center rounded-full bg-accent transition-transform group-hover:scale-105">
              <Play className="ml-1 size-7 text-accent-ink" />
            </span>
          </div>
          <span className="absolute right-4 top-4 rounded-full border border-line-strong bg-cream px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">
            Demo
          </span>
          <span className="absolute bottom-4 left-4 text-left text-ink">
            <b className="block text-[15px] font-semibold">How AFRA works</b>
            <span className="text-[12.5px] text-ink-soft">
              From an Instagram comment to a candidate booking their interview
            </span>
          </span>
        </button>
      )}

      {open && typeof document !== "undefined" ? createPortal(overlay, document.body) : null}
    </>
  );
}
