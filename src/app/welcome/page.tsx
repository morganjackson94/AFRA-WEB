import { FOUNDING_PRICE_CENTS, getBillingProvider } from "../../lib/billing";
import { WelcomeClient } from "./WelcomeClient";

export const dynamic = "force-dynamic";

// Stripe hands off here after a completed founding checkout (success_url —
// see startOnboardingAction). Its only two jobs: fire the Meta Purchase pixel
// event exactly once (client-side, see WelcomeClient), then hand off to the
// existing dashboard post-payment welcome banner via a click-through — this
// page deliberately does NOT duplicate that banner's copy/logic.
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  // Real charged amount when we can read it (see getCheckoutSessionAmount);
  // falls back to the known founding price so this page never blocks a
  // just-paid operator on a Stripe read. sessionId is genuinely optional here
  // (see WelcomeClient — no sessionId means no pixel fire, not an error page).
  const amount = sessionId ? await getBillingProvider().getCheckoutSessionAmount(sessionId) : null;
  const amountTotal = amount?.amountTotal ?? FOUNDING_PRICE_CENTS;
  const currency = (amount?.currency ?? "usd").toUpperCase();

  return (
    <WelcomeClient
      sessionId={sessionId}
      value={amountTotal / 100}
      currency={currency}
      continueHref="/dashboard?checkout=success"
    />
  );
}
