"use client";

import Link from "next/link";
import { captureAttribution, getOrCreateSessionId, sendFunnelBeacon } from "../lib/sessionAttribution";

// Four of these exist on the homepage (nav, hero, pricing, final) — id
// distinguishes which one a cta_click event is about (WizardFunnelEvent.
// elementId), so "the leak is before step 1" can be split further into
// "which CTA people do/don't tap." Beacon-only, not the usual server action:
// this fires the instant before a real navigation to /onboarding, which a
// plain fetch/server-action call risks losing to that navigation — see
// sessionAttribution.ts's sendFunnelBeacon. Deliberately NOT also sent via
// the normal server-action path as a "belt-and-suspenders" fallback — that
// was tried and produced a duplicate row per click (verified against a real
// preview deployment), which corrupts click counts worse than an occasional
// missed beacon would. sendBeacon alone is standard practice for exactly
// this pattern and reliable enough on its own.
export function CTA({
  id,
  size = "base",
  full = false,
  label = "Claim your spot",
  tone = "accent",
}: {
  id: "nav" | "hero" | "pricing" | "final";
  size?: "base" | "lg";
  full?: boolean;
  label?: string;
  // "accent" = the lit amber primary (one per view); "outline" = the quiet
  // cream-on-periwinkle treatment for the persistent nav button, so the sticky
  // CTA never competes with each section's single amber moment.
  tone?: "accent" | "outline";
}) {
  return (
    <Link
      href="/onboarding"
      onClick={() => {
        const sessionId = getOrCreateSessionId();
        const attribution = captureAttribution();
        sendFunnelBeacon({ sessionId, eventType: "cta_click", step: 0, elementId: id, attribution });
      }}
      className={`inline-flex items-center justify-center rounded-full font-medium transition duration-150 hover:opacity-90 active:scale-[0.98] ${
        tone === "accent"
          ? "border border-accent bg-accent text-accent-ink"
          : "border border-line-strong bg-transparent text-ink hover:bg-cream"
      } ${size === "lg" ? "px-8 py-4 text-base" : "px-5 py-2.5 text-[14.5px]"} ${full ? "w-full" : ""}`}
    >
      {label}
    </Link>
  );
}
