"use client";

import { useEffect } from "react";
import { logWizardFunnelEventAction } from "../app/onboarding/actions";
import { captureAttribution, getOrCreateSessionId, hasFiredOnce, markFiredOnce } from "../lib/sessionAttribution";

const LANDING_VIEW_KEY = "afraLandingViewFired";

// Renders nothing — mount it once near the top of the homepage. Closes the
// gap that made the wizard's 92% first-step drop-off ambiguous: without
// this, anyone who saw the ad, landed on /, and never clicked through was
// invisible to WizardFunnelEvent (which only fired on /onboarding mount).
// Deduped the same way session_started is (sessionStorage flag, not a
// server-side time-window guess) — a reload of the homepage itself
// shouldn't inflate landing counts any more than a wizard reload should.
export function LandingViewTracker() {
  useEffect(() => {
    if (hasFiredOnce(LANDING_VIEW_KEY)) return;
    markFiredOnce(LANDING_VIEW_KEY);
    const sessionId = getOrCreateSessionId();
    const attribution = captureAttribution();
    void logWizardFunnelEventAction(sessionId, "landing_view", 0, undefined, undefined, attribution);
  }, []);

  return null;
}
