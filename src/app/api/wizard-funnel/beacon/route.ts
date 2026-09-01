import { prisma } from "../../../../lib/prisma";
import { logWizardFunnelEvent, type Attribution, type WizardFunnelEventType } from "../../../../lib/wizardFunnel";

// Receiver for navigator.sendBeacon() calls only — see sessionAttribution.ts's
// sendFunnelBeacon(). Everything else in the funnel goes through the normal
// server-action path (logWizardFunnelEventAction); this route exists
// specifically for the two events fired right before a navigation the page
// might not survive to finish an ordinary call for (a homepage CTA click,
// about to navigate to /onboarding; a tab close/abandonment mid-wizard).
// sendBeacon can only POST to a plain URL, not invoke a server action
// directly, hence a real route here rather than reusing the action.
//
// Same non-blocking, never-throws-back doctrine as the rest of the funnel:
// a malformed or missing body is silently ignored, not an error response —
// there's no client listening for the response either way (sendBeacon is
// fire-and-forget by design).

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      eventType?: string;
      step?: number;
      email?: string;
      elementId?: string;
      attribution?: Attribution;
    };
    if (!body.sessionId || !body.eventType) {
      return Response.json({ ok: false }, { status: 204 });
    }
    await logWizardFunnelEvent(prisma, {
      wizardSessionId: body.sessionId,
      eventType: body.eventType as WizardFunnelEventType,
      step: body.step ?? 0,
      email: body.email,
      elementId: body.elementId,
      attribution: body.attribution,
    });
  } catch (err) {
    console.error("[wizardFunnel] beacon receive failed:", err);
  }
  // 204: nothing to say back to a sendBeacon caller, which ignores the
  // response anyway.
  return new Response(null, { status: 204 });
}
