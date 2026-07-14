"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cancelBilling, updateCard } from "../../lib/activation";
import { getBillingProvider } from "../../lib/billing";
import { prisma } from "../../lib/prisma";
import { resolveOperatorId } from "../../lib/session";

// Thin server actions. These REUSE the Step 3 billing ops — no new billing logic.

export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const operatorId = String(formData.get("operatorId"));
  await cancelBilling(prisma, getBillingProvider(), operatorId);
  revalidatePath("/dashboard");
}

export async function updateCardAction(formData: FormData): Promise<void> {
  const operatorId = String(formData.get("operatorId"));
  // Test-mode card token. A real card-entry UI (Stripe Elements) replaces this;
  // the billing op it calls (updateCard) is unchanged.
  const paymentMethodId = String(formData.get("paymentMethodId") || "pm_card_visa");
  await updateCard(prisma, getBillingProvider(), operatorId, paymentMethodId);
  revalidatePath("/dashboard");
}

// Connect Instagram, for real: sends the operator to ManyChat's hosted connect
// page for THEIR cloned flow (manychatConnectUrl, set by the founder after
// cloning it — see ChannelConnection). Marks "connecting" so the dashboard can
// say so honestly; only the founder-confirm route (or a future ManyChat status
// webhook) ever sets "connected", so the platform gate can't lie.
export async function startManyChatConnectAction(formData: FormData): Promise<void> {
  // Re-derive from the session — never trust a client-supplied operatorId for
  // an action that mutates data (the hidden form field is a convenience for
  // display/routing elsewhere, not an authorization source).
  const operatorId = await resolveOperatorId();
  if (!operatorId) redirect("/login");

  const channelConnectionId = String(formData.get("channelConnectionId"));
  const conn = await prisma.channelConnection.findFirst({
    where: { id: channelConnectionId, operatorId },
  });
  if (!conn || !conn.manychatConnectUrl) {
    // Nothing to connect to yet (founder hasn't cloned the flow for them) —
    // stay put rather than 404/error on a button that looked clickable.
    revalidatePath("/dashboard");
    return;
  }

  await prisma.channelConnection.update({ where: { id: conn.id }, data: { status: "connecting" } });
  revalidatePath("/dashboard");
  redirect(conn.manychatConnectUrl);
}
