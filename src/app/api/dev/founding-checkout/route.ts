import { confirmFoundingPayment } from "../../../../lib/activation";
import { getBillingProvider } from "../../../../lib/billing";
import { prisma } from "../../../../lib/prisma";

// DEV-ONLY stand-in for Stripe-hosted checkout + webhook, active ONLY in fake
// billing mode (no STRIPE_SECRET_KEY). With a real key this returns 404 — real
// Stripe + the verified webhook are the source of truth there.
//
// The "Pay" action POSTs here and calls the SAME confirmFoundingPayment() the
// real webhook calls (server-side), so "paid" is never inferred from a redirect
// param. No card data is collected (there is none in fake mode).

function devEnabled() {
  return getBillingProvider().mode === "fake";
}

export async function GET(request: Request): Promise<Response> {
  if (!devEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  const operatorId = url.searchParams.get("operator_id") ?? "";
  const success = url.searchParams.get("success") ?? "/dashboard";
  const cancel = url.searchParams.get("cancel") ?? "/onboarding";

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<title>Test checkout — AFRA (dev)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
  /* Same periwinkle/cream/amber world as the app. Pay = the single amber moment. */
  :root{color-scheme:dark;}
  body{font-family:Inter,system-ui,sans-serif;background:#2D2D4A;color:#F0E8D8;margin:0;
    min-height:100vh;display:grid;place-items:center;}
  .card{background:#3A3A5C;border:1px solid rgba(240,232,216,.16);border-radius:20px;padding:36px;max-width:400px;width:90%;text-align:center;}
  /* Betak structural label */
  .badge{display:inline-block;color:#C2BBAA;font-size:12px;font-weight:600;
    margin-bottom:18px;letter-spacing:.15em;text-transform:uppercase;}
  /* Flho serif display */
  h1{font-family:"Fraunces",Georgia,serif;font-weight:540;font-size:24px;margin:0 0 8px;letter-spacing:-.01em;}
  .amt{font-family:"Fraunces",Georgia,serif;font-size:44px;font-weight:500;letter-spacing:-.02em;margin:12px 0 2px;}
  .sub{color:#C2BBAA;font-size:14px;margin-bottom:22px;}
  button{font-family:inherit;width:100%;border-radius:9999px;padding:13px;font-size:15px;font-weight:500;cursor:pointer;border:1px solid rgba(240,232,216,.22);}
  .pay{background:#C47628;color:#1E1E33;border-color:#C47628;margin-bottom:10px;}
  .cancel{background:none;color:#C2BBAA;border-color:rgba(240,232,216,.22);}
  .note{color:#C9A876;font-size:12px;margin-top:18px;line-height:1.5;}
</style></head><body>
  <div class="card">
    <div class="badge">Test mode · dev stand-in</div>
    <h1>AFRA — Founding Operator</h1>
    <div class="amt">$1,990</div>
    <div class="sub">First year · annual prepay, billed once</div>
    <form method="post">
      <input type="hidden" name="action" value="pay"/>
      <input type="hidden" name="session_id" value="${sessionId}"/>
      <input type="hidden" name="operator_id" value="${operatorId}"/>
      <input type="hidden" name="success" value="${success}"/>
      <button class="pay" type="submit">Pay $1,990 (simulate confirmed payment)</button>
    </form>
    <form method="post">
      <input type="hidden" name="action" value="cancel"/>
      <input type="hidden" name="cancel" value="${cancel}"/>
      <button class="cancel" type="submit">Cancel</button>
    </form>
    <p class="note">Stand-in for Stripe Checkout + webhook (fake billing mode).
    No card is collected. With a real Stripe key this page does not exist.</p>
  </div>
</body></html>`;

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request): Promise<Response> {
  if (!devEnabled()) return new Response("Not found", { status: 404 });
  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "cancel") {
    return Response.redirect(String(form.get("cancel") || "/onboarding"), 303);
  }

  const operatorId = String(form.get("operator_id") ?? "");
  const sessionId = String(form.get("session_id") ?? "");
  const success = String(form.get("success") || "/dashboard");

  // Simulate the webhook server-side (same function the real webhook calls).
  // Never livemode — this route only exists in fake billing mode at all.
  await confirmFoundingPayment(prisma, operatorId, {
    checkoutSessionId: sessionId,
    paymentIntentId: `pi_fake_${operatorId}`,
    customerId: `cus_fake_${operatorId}`,
    livemode: false,
  });

  return Response.redirect(success, 303);
}
