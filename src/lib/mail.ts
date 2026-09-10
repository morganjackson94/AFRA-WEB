// Outbound email seam. Same honesty pattern as channel.ts/calendar.ts: a real
// send when RESEND_API_KEY is configured (a single fetch call — no SDK needed),
// and an explicit console-logged stub otherwise so local dev/testing works
// without an email provider. The stub NEVER pretends to have sent anything.

import { CONTACT_EMAIL } from "./constants";

export type SendResult = { sent: boolean; stub?: boolean };

const FROM = process.env.MAIL_FROM ?? "AFRA <login@afravisibility.com>";

async function sendViaResend(
  args: { to: string; subject: string; html: string; text: string; replyTo?: string },
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[mail:STUB] would send "${args.subject}" to ${args.to}:\n${args.text}`);
    return { sent: false, stub: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[mail:ERROR] Resend send failed (${res.status}): ${body}`);
    return { sent: false };
  }
  console.log(`[mail:SENT] "${args.subject}" to ${args.to}`);
  return { sent: true };
}

/** Send the magic-link login email. Falls back to a console-logged link in dev. */
export async function sendMagicLinkEmail(args: { to: string; verifyUrl: string }): Promise<SendResult> {
  const subject = "Log in to AFRA";
  const text = `Tap to log in: ${args.verifyUrl}\n\nThis link expires in 15 minutes and only works once. If you didn't request it, ignore this email.`;
  const html = `
    <p>Tap to log in:</p>
    <p><a href="${args.verifyUrl}">${args.verifyUrl}</a></p>
    <p style="color:#888;font-size:13px">This link expires in 15 minutes and only works once. If you didn't request it, ignore this email.</p>
  `;
  return sendViaResend({ to: args.to, subject, html, text });
}

/**
 * The post-payment welcome email — sent from confirmFoundingPayment()
 * (activation.ts) after a genuine confirmation. This is the ONLY place a web
 * signup gets their onboarding call booked (see bookingUrl below); nothing
 * else in the product does this for them. States the $149 setup fee was
 * actually charged today (it was — see SETUP_FEE_CENTS, src/lib/billing.ts)
 * and the trial terms for what comes after. Same white-glove framing as the
 * dashboard's own awaiting-setup banner (src/app/dashboard/page.tsx). Approved
 * wording lives in docs/CLAIMS.md — this must stay in sync with it.
 */
export async function sendWelcomeAwaitingSetupEmail(
  args: { to: string; dashboardUrl: string; bookingUrl: string },
): Promise<SendResult> {
  const subject = "You're in. Book your ten minutes.";
  const text = `Hi there,

You're in. Welcome to AFRA.

$149 was charged today for your setup. Nothing else is charged until you've had 20 screened candidates or 60 days go by, whichever comes first. After that it's $4,788 a year — about $399 a month — every location.

We're building your setup now. One thing to do: book your ten-minute call.

${args.bookingUrl}

On that call you connect your Instagram — you log into Facebook and click yes — and watch a test candidate land in your spreadsheet. That's the whole call.

Before then, make sure your Instagram is a Business or Creator account connected to a Facebook Page. It won't connect otherwise.

Your dashboard: ${args.dashboardUrl}
Sign in with this email, no password. It'll look quiet until your screener is live.

If something's broken on our end on that call, the $149 comes back.

Reply any time. This comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>You're in. Welcome to AFRA.</p>
    <p>$149 was charged today for your setup. Nothing else is charged until you've had 20 screened candidates or 60 days go by, whichever comes first. After that it's $4,788 a year — about $399 a month — every location.</p>
    <p><strong>We're building your setup now. One thing to do: book your ten-minute call.</strong></p>
    <p><a href="${args.bookingUrl}">${args.bookingUrl}</a></p>
    <p>On that call you connect your Instagram — you log into Facebook and click yes — and watch a test candidate land in your spreadsheet. That's the whole call.</p>
    <p>Before then, make sure your Instagram is a Business or Creator account connected to a Facebook Page. It won't connect otherwise.</p>
    <p>Your dashboard: <a href="${args.dashboardUrl}">${args.dashboardUrl}</a><br/>Sign in with this email, no password. It'll look quiet until your screener is live.</p>
    <p>If something's broken on our end on that call, the $149 comes back.</p>
    <p>Reply any time. This comes straight to me.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}

/**
 * "You're live" email, variant A (normal reach) — sent from connectChannel()
 * (activation.ts) on a genuine transition to "connected", for an operator
 * whose followerBand isn't in LOW_REACH_FOLLOWER_BANDS (qualification.ts).
 */
export async function sendYoureLiveEmail(
  args: { to: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "You're live. Here's how applicants find you.";
  const text = `Hi there,

Your Instagram is connected. Applicants can reach you now.

Here's the mechanic: when someone comments or messages the keyword on your hiring post, AFRA replies instantly, screens them against your criteria, and qualified candidates book straight into your calendar.

Post your hiring post, then watch your dashboard for candidates coming in.

${args.dashboardUrl}

Sign in with this email address any time. One-time link, no password.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>Your Instagram is connected. Applicants can reach you now.</p>
    <p>Here's the mechanic: when someone comments or messages the keyword on your hiring post, AFRA replies instantly, screens them against your criteria, and qualified candidates book straight into your calendar.</p>
    <p>Post your hiring post, then watch your dashboard for candidates coming in.</p>
    <p><a href="${args.dashboardUrl}">${args.dashboardUrl}</a></p>
    <p>Sign in with this email address any time. One-time link, no password.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}

/**
 * "You're live" email, variant B (low reach) — same trigger as variant A, for
 * an operator whose followerBand IS in LOW_REACH_FOLLOWER_BANDS. Adds the
 * three real, existing traffic mechanics (QR/bio-link/keyword-everywhere —
 * all already live in the dashboard, nothing fabricated) plus a concierge
 * offer. reachFlag is concierge-only context (qualification.ts) — never
 * framed to the operator as a rejection, only as extra help.
 */
export async function sendYoureLiveLowReachEmail(
  args: { to: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "You're live. Let's make sure applicants find you.";
  const text = `Hi there,

Your Instagram is connected. Applicants can reach you now.

Here's the mechanic: when someone comments or messages the keyword on your hiring post, AFRA replies instantly, screens them against your criteria, and qualified candidates book straight into your calendar.

With a smaller following, the fastest ways to get applicants in front of that mechanic are:

1. Print the QR code from your dashboard and put it up in-store.
2. Put your hiring link in your Instagram bio.
3. Add the keyword comment prompt to every post, not just the hiring one.

Reply to this email and I'll help you set any of this up, personally.

${args.dashboardUrl}

Sign in with this email address any time. One-time link, no password.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>Your Instagram is connected. Applicants can reach you now.</p>
    <p>Here's the mechanic: when someone comments or messages the keyword on your hiring post, AFRA replies instantly, screens them against your criteria, and qualified candidates book straight into your calendar.</p>
    <p>With a smaller following, the fastest ways to get applicants in front of that mechanic are:</p>
    <ol>
      <li>Print the QR code from your dashboard and put it up in-store.</li>
      <li>Put your hiring link in your Instagram bio.</li>
      <li>Add the keyword comment prompt to every post, not just the hiring one.</li>
    </ol>
    <p>Reply to this email and I'll help you set any of this up, personally.</p>
    <p><a href="${args.dashboardUrl}">${args.dashboardUrl}</a></p>
    <p>Sign in with this email address any time. One-time link, no password.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}

/**
 * Day-20 check-in — scheduled honesty check before the 30-day guarantee
 * closes (see /api/jobs/run-scheduled-emails). Deliberately short: two
 * paragraphs, no upsell, no automation claims.
 */
export async function sendCheckinEmail(
  args: { to: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "Three weeks in. How's it going?";
  const text = `Hi there,

You're about three weeks into your trial. How's it going, and how many candidates have you screened so far? If anything isn't working the way you expected, reply to this email and I'll personally sort it out.

Your dashboard is always here: ${args.dashboardUrl} (sign in with this email address, one-time link, no password).

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>You're about three weeks into your trial. How's it going, and how many candidates have you screened so far? If anything isn't working the way you expected, reply to this email and I'll personally sort it out.</p>
    <p>Your dashboard is always here: <a href="${args.dashboardUrl}">${args.dashboardUrl}</a> (sign in with this email address, one-time link, no password).</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}

/**
 * Sent once, by sendTrialEndedEmailOnce (activation.ts), the moment
 * applyStripeStatus detects the operator's subscription has left "trialing"
 * — whichever of the two causes triggered it (hit the 20-candidate cap early,
 * or the 60-day backstop passed). The operator has just had their first real
 * charge; this is the honest "billing has started" moment, not a surprise.
 */
export async function sendTrialEndedEmail(
  args: { to: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "Your trial's ended. You're on $4,788/year.";
  const text = `Hi there,

Your free trial has ended, either because you've screened 20 candidates or your 60 days ran out. You're now on the standard $4,788/year plan (about $399/month), billed to the card on file.

You can cancel any time from your dashboard: ${args.dashboardUrl} (sign in with this email address, one-time link, no password).

Reply any time. This comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>Your free trial has ended, either because you've screened 20 candidates or your 60 days ran out. You're now on the standard $4,788/year plan (about $399/month), billed to the card on file.</p>
    <p>You can cancel any time from your dashboard: <a href="${args.dashboardUrl}">${args.dashboardUrl}</a> (sign in with this email address, one-time link, no password).</p>
    <p>Reply any time. This comes straight to me.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}

/**
 * Sent once, by /api/jobs/run-scheduled-emails, TRIAL_ENDING_SOON_DAYS_BEFORE
 * days before the trial's 60-day backstop (see billing.ts's
 * trialBackstopDate() — the same date describeBilling derives for dashboard
 * display, so there's one source of truth for when the trial ends). Exists
 * because Stripe's own customer.subscription.trial_will_end fires a fixed 3
 * days out and isn't configurable — inadequate notice for a $4,788 charge.
 * daysRemaining is computed fresh at send time rather than hardcoded to
 * TRIAL_ENDING_SOON_DAYS_BEFORE, so the copy stays accurate even if the job
 * runs a day or two late (a missed cron run, not a bug) and actually finds
 * fewer days left than the job's own trigger window.
 */
export async function sendTrialEndingSoonEmail(
  args: { to: string; dashboardUrl: string; trialEndDate: string; daysRemaining: number },
): Promise<SendResult> {
  const whenPhrase = args.daysRemaining === 1 ? "Tomorrow" : `In ${args.daysRemaining} days`;
  const subject = args.daysRemaining === 1 ? "Your trial ends tomorrow" : `Your trial ends in ${args.daysRemaining} days`;
  const text = `Hi there,

${whenPhrase}, on ${args.trialEndDate}, your free trial ends and we'll charge $4,788 for the year to the card on file — unless you cancel before then.

If everything's working the way you want, there's nothing to do. If it's not, or you're not sure, reply to this email or cancel from your dashboard before ${args.trialEndDate} and you won't be charged.

Your dashboard: ${args.dashboardUrl} (sign in with this email address, one-time link, no password).

Reply any time. This comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>${whenPhrase}, on ${args.trialEndDate}, your free trial ends and we'll charge $4,788 for the year to the card on file — unless you cancel before then.</p>
    <p>If everything's working the way you want, there's nothing to do. If it's not, or you're not sure, reply to this email or cancel from your dashboard before ${args.trialEndDate} and you won't be charged.</p>
    <p>Your dashboard: <a href="${args.dashboardUrl}">${args.dashboardUrl}</a> (sign in with this email address, one-time link, no password).</p>
    <p>Reply any time. This comes straight to me.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}
