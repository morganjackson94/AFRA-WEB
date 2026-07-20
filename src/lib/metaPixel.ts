// Thin client-side wrapper around the Meta base pixel (fbq init/PageView live
// in src/app/layout.tsx). Every call is a no-op if the pixel script hasn't
// loaded (ad blocker, NEXT_PUBLIC_META_PIXEL_ID unset) — tracking must never
// throw and break the funnel it's watching.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Fires a client-side Meta Pixel event. `eventId` becomes fbq's `eventID`
 * (Meta's dedup key against a future server-side Conversions API send of the
 * same event — not built yet, but this is the hook for it).
 */
export function trackMetaEvent(
  eventName: string,
  customData?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (eventId) {
    window.fbq("track", eventName, customData ?? {}, { eventID: eventId });
  } else if (customData) {
    window.fbq("track", eventName, customData);
  } else {
    window.fbq("track", eventName);
  }
}
