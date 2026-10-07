"use client";

import { captureAttribution, getOrCreateSessionId, sendFunnelBeacon } from "../lib/sessionAttribution";

// The pricing card's secondary action: same cta_click event as CTA.tsx, told
// apart by elementId ("pricing_book_call") so funnel reads can split "chose
// the call" from "chose checkout" without a new event type. Beacon-only for
// the same reason as CTA.tsx — it fires right as the browser leaves for the
// booking page. url comes from the server (SALES_CALL_URL), never inlined.
export function BookCallButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        const sessionId = getOrCreateSessionId();
        const attribution = captureAttribution();
        sendFunnelBeacon({ sessionId, eventType: "cta_click", step: 0, elementId: "pricing_book_call", attribution });
      }}
      className="inline-flex w-full items-center justify-center rounded-full border border-line-strong bg-transparent px-4 py-4 text-base font-medium sm:px-8 text-ink transition duration-150 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-[0.98]"
    >
      Rather talk first? Book a call
    </a>
  );
}
