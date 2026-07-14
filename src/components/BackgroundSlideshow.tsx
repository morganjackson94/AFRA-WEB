"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

// Full-bleed, looping crossfade background. Stacks every image at all times
// (opacity toggles, nothing unmounts) so the fade is smooth with no reload
// flicker. Autoplay pauses for prefers-reduced-motion — the images still
// show, they just stop cycling.
export function BackgroundSlideshow({
  images,
  intervalMs = 6000,
}: {
  images: string[];
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      {images.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          sizes="100vw"
          priority={i === 0}
          className={`object-cover transition-opacity duration-[1500ms] ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {/* Periwinkle-tinted scrim (not plain black) so the photos stay in the
          app's dark world and the title/CTA keep full contrast on top. */}
      <div className="absolute inset-0 bg-bg/85" />
    </div>
  );
}
