"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Reveal } from "../../components/Reveal";
import { trackMetaEvent } from "../../lib/metaPixel";

// sessionStorage (not localStorage) is deliberate — the dedup only needs to
// survive a refresh/back-nav on the SAME tab for the SAME checkout, not
// persist forever. Keyed to session_id so a different completed checkout
// later (new tab, new session_id) still fires its own StartTrial.
function storageKey(sessionId: string): string {
  return `afra_trial_started_fired_${sessionId}`;
}

export function WelcomeClient({
  sessionId,
  continueHref,
}: {
  sessionId: string | undefined;
  continueHref: string;
}) {
  // Belt-and-suspenders against StrictMode/fast-refresh double-invoking the
  // effect in dev — the sessionStorage check alone already prevents a real
  // duplicate fire, this just avoids a same-render double-write to it.
  const fired = useRef(false);

  useEffect(() => {
    if (!sessionId || fired.current) return;
    const key = storageKey(sessionId);
    if (window.sessionStorage.getItem(key)) return;

    // StartTrial, not Purchase — nothing is charged at signup under the
    // trial model (see docs/CLAIMS.md). The real conversion event (trial ->
    // paid) is a separate, deliberately descoped fast-follow — see the
    // comment on getBillingProvider/getCheckoutSessionAmount in billing.ts.
    trackMetaEvent("StartTrial", { value: 0, currency: "USD" }, sessionId);
    window.sessionStorage.setItem(key, "1");
    fired.current = true;
  }, [sessionId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-6 py-16 text-ink">
      <Reveal>
        <h1 className="t-title mb-3">You&apos;re in.</h1>
        <p className="mb-8 text-[15px] leading-relaxed text-ink-soft">
          Your free trial has started — your first 20 screened candidates are on us. Head to your
          dashboard to connect Instagram and finish setup.
        </p>
        <Link
          href={continueHref}
          className="inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3.5 text-base font-medium text-accent-ink transition hover:opacity-90"
        >
          Continue to your dashboard
        </Link>
      </Reveal>
    </main>
  );
}
