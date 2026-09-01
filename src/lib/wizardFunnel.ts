import type { PrismaClient } from "../generated/prisma/client";
import { normalizeEmail } from "./constants";

// Best-effort funnel diagnostic, now spanning landing -> wizard -> checkout
// (see WizardFunnelEvent in schema.prisma for why this isn't the Event
// model). Purely a read-later diagnostic — a failed write must never block
// wizard progression or checkout, same non-blocking doctrine as the mail and
// pixel work, so every entry point here swallows its own errors.
//
// "started" (fired on every wizard mount, whether a fresh visit or a reload)
// turned out to corrupt every drop-off percentage computed from it: reloads,
// back-button, and reopened tabs against the same sessionStorage id all
// re-fired it, so "52 sessions" wasn't cleanly 52 unique visits. Split into
// page_view (repeatable — every mount, on purpose; a cluster of pings in a
// few seconds is itself a signal, e.g. of prefetch/bot traffic) and
// session_started (fires exactly once per wizardSessionId, gated client-side
// via sessionStorage — see sessionAttribution.ts's hasFiredOnce/markFiredOnce).

export type WizardFunnelEventType =
  | "landing_view" // homepage mount, once per session — see LandingViewTracker.tsx
  | "cta_click" // a homepage CTA was tapped through to /onboarding — see CTA.tsx
  | "page_view" // wizard mount, every time (reloads included)
  | "session_started" // wizard mount, once per session
  | "intro_completed" // tapped "Start" on the pre-step-1 intro screen
  | "step_completed" // finished a numbered step (1-7)
  | "abandoned"; // tab closed/navigated away mid-wizard, not via the redirect to Stripe

export type Attribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
  landingPath?: string;
};

export async function logWizardFunnelEvent(
  prisma: PrismaClient,
  args: {
    wizardSessionId: string;
    eventType: WizardFunnelEventType;
    step: number;
    email?: string;
    elementId?: string;
    attribution?: Attribution;
  },
): Promise<void> {
  if (!args.wizardSessionId) return;
  try {
    await prisma.wizardFunnelEvent.create({
      data: {
        wizardSessionId: args.wizardSessionId,
        eventType: args.eventType,
        step: args.step,
        email: args.email && args.email.includes("@") ? normalizeEmail(args.email) : undefined,
        elementId: args.elementId,
        utmSource: args.attribution?.utmSource,
        utmMedium: args.attribution?.utmMedium,
        utmCampaign: args.attribution?.utmCampaign,
        utmContent: args.attribution?.utmContent,
        utmTerm: args.attribution?.utmTerm,
        fbclid: args.attribution?.fbclid,
        gclid: args.attribution?.gclid,
        referrer: args.attribution?.referrer,
        landingPath: args.attribution?.landingPath,
      },
    });
  } catch (err) {
    console.error("[wizardFunnel] failed to log event:", err);
  }
}
