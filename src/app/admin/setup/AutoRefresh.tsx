"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-checks every few seconds while something is still red, so the Rep can
 *  watch the test candidate turn the webhook line green during the call. */
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
