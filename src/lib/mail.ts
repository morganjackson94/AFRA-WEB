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

/** Closes the awaiting-setup loop: sent the moment a founding operator who was
 *  waiting on the flow pool gets a manychatConnectUrl (pool backfilled, or the
 *  founder sets it by hand). Carries a login link so there's no separate
 *  password/step between the email and the dashboard. */
export async function sendReadyToConnectEmail(args: { to: string; loginUrl: string }): Promise<SendResult> {
  const subject = "Your Instagram is ready to connect";
  const text = `Good news. Your account is ready. Log in and connect your Instagram to go live: ${args.loginUrl}\n\nThis link expires in 15 minutes and only works once.`;
  const html = `
    <p>Good news. Your account is ready.</p>
    <p><a href="${args.loginUrl}">Log in and connect your Instagram</a> to go live.</p>
    <p style="color:#888;font-size:13px">This link expires in 15 minutes and only works once.</p>
  `;
  return sendViaResend({ to: args.to, subject, html, text });
}

/**
 * Welcome email, variant A — sent from confirmFoundingPayment() (activation.ts)
 * when a ManyChat flow was assigned at signup (pool had stock), so connecting
 * Instagram is something the operator can do right now. Carries a magic-link
 * straight into the dashboard — the operator's only way back in if they
 * signed up inside Instagram's in-app browser and closed it. Trial terms
 * (not a charge confirmation — nothing is charged yet) — see docs/CLAIMS.md
 * for the approved wording this must stay in sync with.
 */
export async function sendWelcomeAssignedEmail(
  args: { to: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "You're in. Let's get you live.";
  const text = `Hi there,

You're in. Welcome to AFRA.

Your trial has started: your first 20 screened candidates are free, for up to 60 days. After that (or once you hit 20, whichever comes first), it's $399/month. Cancel any time before then and you're never charged.

One thing left to do:

${args.dashboardUrl}

Sign in with this email address. You'll get a one-time link, no password. Inside, there's one task waiting: connect your Instagram account. Once it's connected, applicants can start reaching you.

Reply any time. This comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>You're in. Welcome to AFRA.</p>
    <p>Your trial has started: your first 20 screened candidates are free, for up to 60 days. After that (or once you hit 20, whichever comes first), it's $399/month. Cancel any time before then and you're never charged.</p>
    <p><strong>One thing left to do</strong></p>
    <p><a href="${args.dashboardUrl}">${args.dashboardUrl}</a></p>
    <p>Sign in with this email address. You'll get a one-time link, no password. Inside, there's one task waiting: connect your Instagram account. Once it's connected, applicants can start reaching you.</p>
    <p>Reply any time. This comes straight to me.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}

/**
 * Welcome email, variant B — sent when the ManyChat pool was empty at signup
 * time, so there's no connect action for the operator to take yet. Deliberately
 * does NOT tell them to connect Instagram (there's nothing to click) and does
 * NOT duplicate sendReadyToConnectEmail's content — it only forward-references
 * that email, which fires later once the founder (or a pool backfill) resolves
 * the wait. Same white-glove framing as the dashboard's own awaiting-setup
 * banner (src/app/dashboard/page.tsx).
 */
export async function sendWelcomeAwaitingSetupEmail(
  args: { to: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "You're in. We're setting you up now.";
  const text = `Hi there,

You're in. Welcome to AFRA.

Your trial has started: your first 20 screened candidates are free, for up to 60 days. After that (or once you hit 20, whichever comes first), it's $399/month. Cancel any time before then and you're never charged.

We're personally setting up your account now. There's nothing you need to do yet. You'll get an email the moment your Instagram is ready to connect, usually within a few hours.

In the meantime, here's your dashboard:

${args.dashboardUrl}

Sign in with this email address. You'll get a one-time link, no password. It'll look quiet until your screener goes live. That's expected, not broken.

Reply any time. This comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>You're in. Welcome to AFRA.</p>
    <p>Your trial has started: your first 20 screened candidates are free, for up to 60 days. After that (or once you hit 20, whichever comes first), it's $399/month. Cancel any time before then and you're never charged.</p>
    <p><strong>We're personally setting up your account now</strong></p>
    <p>There's nothing you need to do yet. You'll get an email the moment your Instagram is ready to connect, usually within a few hours.</p>
    <p><strong>In the meantime, here's your dashboard</strong></p>
    <p><a href="${args.dashboardUrl}">${args.dashboardUrl}</a></p>
    <p>Sign in with this email address. You'll get a one-time link, no password. It'll look quiet until your screener goes live. That's expected, not broken.</p>
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
  const subject = "Your trial's ended. You're on $399/month.";
  const text = `Hi there,

Your free trial has ended, either because you've screened 20 candidates or your 60 days ran out. You're now on the standard $399/month plan, billed to the card on file.

You can cancel any time from your dashboard: ${args.dashboardUrl} (sign in with this email address, one-time link, no password).

Reply any time. This comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>Hi there,</p>
    <p>Your free trial has ended, either because you've screened 20 candidates or your 60 days ran out. You're now on the standard $399/month plan, billed to the card on file.</p>
    <p>You can cancel any time from your dashboard: <a href="${args.dashboardUrl}">${args.dashboardUrl}</a> (sign in with this email address, one-time link, no password).</p>
    <p>Reply any time. This comes straight to me.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}
