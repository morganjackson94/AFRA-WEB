import { WelcomeClient } from "./WelcomeClient";

export const dynamic = "force-dynamic";

// Stripe hands off here after a completed checkout (success_url — see
// startOnboardingAction). Its only two jobs: fire the Meta StartTrial pixel
// event exactly once (client-side, see WelcomeClient), then hand off to the
// existing dashboard post-payment welcome banner via a click-through — this
// page deliberately does NOT duplicate that banner's copy/logic.
//
// No Stripe read here anymore: StartTrial always fires with value: 0,
// deliberately not wired to the real amount charged at checkout (now
// SETUP_FEE_CENTS, not 0 — see getCheckoutSessionAmount in billing.ts).
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  return <WelcomeClient sessionId={sessionId} continueHref="/dashboard?checkout=success" />;
}
