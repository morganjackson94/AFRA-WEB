import { WelcomeClient } from "./WelcomeClient";

export const dynamic = "force-dynamic";

// Stripe hands off here after a completed checkout (success_url — see
// startOnboardingAction). Its only two jobs: fire the Meta StartTrial pixel
// event exactly once (client-side, see WelcomeClient), then hand off to the
// existing dashboard post-payment welcome banner via a click-through — this
// page deliberately does NOT duplicate that banner's copy/logic.
//
// No Stripe read here anymore: under the trial model nothing is charged at
// checkout, so there's no "real amount" to look up (getCheckoutSessionAmount
// would legitimately return 0) — StartTrial always fires with value: 0.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  return <WelcomeClient sessionId={sessionId} continueHref="/dashboard?checkout=success" />;
}
