"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Reveal } from "../../components/Reveal";
import { trackMetaEvent } from "../../lib/metaPixel";

// sessionStorage (not localStorage) is deliberate — the dedup only needs to
// survive a refresh/back-nav on the SAME tab for the SAME checkout, not
// persist forever. Keyed to session_id so a different completed checkout
// later (new tab, new session_id) still fires its own Purchase.
function storageKey(sessionId: string): string {
  return `afra_purchase_fired_${sessionId}`;
}

export function WelcomeClient({
  sessionId,
  value,
  currency,
  continueHref,
}: {
  sessionId: string | undefined;
  value: number;
  currency: string;
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

    trackMetaEvent("Purchase", { value, currency }, sessionId);
    window.sessionStorage.setItem(key, "1");
    fired.current = true;
  }, [sessionId, value, currency]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-6 py-16 text-ink">
      <Reveal>
        <h1 className="t-title mb-3">You&apos;re in.</h1>
        <p className="mb-8 text-[15px] leading-relaxed text-ink-soft">
          Welcome, Founding Operator. Your $1,990 first year is confirmed — head to your dashboard to
          connect Instagram and finish setup.
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
