"use client";

// Shared client-side identity for a single visit, from landing through
// checkout — used by both the homepage (LandingViewTracker, CTA) and the
// onboarding wizard (OnboardingWizard), so a person's path across both is one
// traceable sequence instead of two disconnected datasets. See
// WizardFunnelEvent in schema.prisma.

const SESSION_ID_KEY = "afraSessionId";
const ATTRIBUTION_KEY = "afraAttribution";

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

/** Same id for the whole visit, whichever page it starts on. Generated once,
 *  persisted in sessionStorage — a refresh or a hop from / to /onboarding
 *  reuses it rather than fragmenting one visit into two sessions. */
export function getOrCreateSessionId(): string {
  let id = window.sessionStorage.getItem(SESSION_ID_KEY) ?? "";
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

/** Captured once, from whichever page actually has the query params — the ad
 *  destination might be the homepage or /onboarding directly, and either way
 *  this only reads the URL the FIRST time it's called this session, then
 *  replays the cached value. That's what lets someone who landed with an
 *  fbclid still carry it at step 7, long after the URL bar has moved on to
 *  /onboarding with no query string at all. Absence of every field is
 *  direct/organic traffic — a real category, recorded as all-null, not
 *  dropped. */
export function captureAttribution(): Attribution {
  const cached = window.sessionStorage.getItem(ATTRIBUTION_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as Attribution;
    } catch {
      // fall through and recapture
    }
  }

  const params = new URLSearchParams(window.location.search);
  const attribution: Attribution = {
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
    utmContent: params.get("utm_content") ?? undefined,
    utmTerm: params.get("utm_term") ?? undefined,
    fbclid: params.get("fbclid") ?? undefined,
    gclid: params.get("gclid") ?? undefined,
    referrer: document.referrer || undefined,
    landingPath: window.location.pathname,
  };
  window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
}

/** Fire-once-per-session gate for events like landing_view/session_started
 *  that must not re-fire on a reload, back-button, or reopened tab against
 *  the same sessionStorage-backed session id — see wizardFunnel.ts's doc
 *  comment on why "started" needed splitting in the first place. */
export function hasFiredOnce(key: string): boolean {
  return window.sessionStorage.getItem(key) === "1";
}

export function markFiredOnce(key: string): void {
  window.sessionStorage.setItem(key, "1");
}

/** Beacon-based send for events that happen right before a navigation the
 *  page might not survive to finish an ordinary fetch/server-action call for
 *  — a CTA click (about to navigate to /onboarding) or a tab close
 *  (abandonment). sendBeacon is the browser's own fire-and-forget mechanism
 *  for exactly this: best-effort delivery that doesn't block or get
 *  cancelled by the navigation/unload that follows it. Silently does nothing
 *  if sendBeacon isn't available (very old browsers) — same non-blocking,
 *  never-throws doctrine as every other funnel call site. */
export function sendFunnelBeacon(payload: {
  sessionId: string;
  eventType: string;
  step: number;
  email?: string;
  elementId?: string;
  attribution: Attribution;
}): void {
  if (!payload.sessionId || typeof navigator === "undefined" || !navigator.sendBeacon) return;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon("/api/wizard-funnel/beacon", blob);
  } catch {
    // best-effort only — never throw during a page teardown
  }
}
