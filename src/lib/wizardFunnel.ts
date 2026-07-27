import type { PrismaClient } from "../generated/prisma/client";
import { normalizeEmail } from "./constants";

// Best-effort funnel diagnostic for the onboarding wizard (see
// WizardFunnelEvent in schema.prisma for why this isn't the Event model).
// Purely a read-later diagnostic — a failed write must never block wizard
// progression or checkout, same non-blocking doctrine as the mail and pixel
// work, so every entry point here swallows its own errors.

export type WizardFunnelEventType = "started" | "step_completed";

export async function logWizardFunnelEvent(
  prisma: PrismaClient,
  args: { wizardSessionId: string; eventType: WizardFunnelEventType; step: number; email?: string },
): Promise<void> {
  if (!args.wizardSessionId) return;
  try {
    await prisma.wizardFunnelEvent.create({
      data: {
        wizardSessionId: args.wizardSessionId,
        eventType: args.eventType,
        step: args.step,
        email: args.email && args.email.includes("@") ? normalizeEmail(args.email) : undefined,
      },
    });
  } catch (err) {
    console.error("[wizardFunnel] failed to log event:", err);
  }
}
