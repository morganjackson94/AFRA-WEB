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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The founding operator's first owned touch after payment — sent from
 * confirmFoundingPayment() on the verified-webhook path only (see
 * activation.ts). Copy is approved final text (docs/CLAIMS.md-checked); do
 * not edit wording here without re-verifying against that file. dashboardUrl
 * points at /login (not a pre-generated magic-link token) because this email
 * may be opened well after the 15-minute token TTL — the copy describes the
 * sign-in flow, not a working link straight into the dashboard.
 * Reply-to is CONTACT_EMAIL — the copy promises "this comes straight to me."
 */
export async function sendFoundingPurchaseConfirmationEmail(
  args: { to: string; firstName?: string; dashboardUrl: string },
): Promise<SendResult> {
  const subject = "You're in — one thing to do today";
  const greeting = args.firstName ? `Hi ${args.firstName},` : "Hi there,";

  const text = `${greeting}

You're in — one of ten founding operators on AFRA.

What you bought: pre-screened candidates delivered to your dashboard, across all your locations, $1,990 flat for the year. No per-location fees, no per-candidate charges.

I'm building your screener now

You already told me what I needed — your roles, your locations, and what makes a candidate an automatic no. I'm turning that into your screener this week. You'll be live within seven days, and if you're not, you don't pay.

One thing to do today

${args.dashboardUrl}

Sign in with this email address — you'll get a one-time link, no password. Inside, there's one task waiting: connect your Instagram account. It takes a click, and I can't route candidates to you until it's done.

Your dashboard will be empty until your screener goes live. That's expected, not broken.

How this works once you're live

You post — a story or feed post with a comment-to-apply prompt. I'll send you three ready-made templates, so you're not writing anything. People who respond get screened against your criteria automatically. Anyone who doesn't meet your bar gets filtered out before they reach you. The ones who do land in your dashboard with their answers — and qualified candidates can book an interview straight into your calendar.

That's the whole loop. The only part that needs you is the posting.

Renewal, so there are no surprises

Your $1,990 covers your first year. After that, renewal is at then-current pricing — founding operators keep a standing 25% discount for as long as you stay subscribed, and you'll get 30 days' notice before any change.

If you change your mind

You have 30 days. Reply to this email and I'll refund you in full. No forms, no process.

Reply any time — this comes straight to me.

Morgan
AFRA Visibility
Dallas, TX`;

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>You're in — one of ten founding operators on AFRA.</p>
    <p>What you bought: pre-screened candidates delivered to your dashboard, across all your locations, $1,990 flat for the year. No per-location fees, no per-candidate charges.</p>
    <p><strong>I'm building your screener now</strong></p>
    <p>You already told me what I needed — your roles, your locations, and what makes a candidate an automatic no. I'm turning that into your screener this week. You'll be live within seven days, and if you're not, you don't pay.</p>
    <p><strong>One thing to do today</strong></p>
    <p><a href="${args.dashboardUrl}">${args.dashboardUrl}</a></p>
    <p>Sign in with this email address — you'll get a one-time link, no password. Inside, there's one task waiting: connect your Instagram account. It takes a click, and I can't route candidates to you until it's done.</p>
    <p>Your dashboard will be empty until your screener goes live. That's expected, not broken.</p>
    <p><strong>How this works once you're live</strong></p>
    <p>You post — a story or feed post with a comment-to-apply prompt. I'll send you three ready-made templates, so you're not writing anything. People who respond get screened against your criteria automatically. Anyone who doesn't meet your bar gets filtered out before they reach you. The ones who do land in your dashboard with their answers — and qualified candidates can book an interview straight into your calendar.</p>
    <p>That's the whole loop. The only part that needs you is the posting.</p>
    <p><strong>Renewal, so there are no surprises</strong></p>
    <p>Your $1,990 covers your first year. After that, renewal is at then-current pricing — founding operators keep a standing 25% discount for as long as you stay subscribed, and you'll get 30 days' notice before any change.</p>
    <p><strong>If you change your mind</strong></p>
    <p>You have 30 days. Reply to this email and I'll refund you in full. No forms, no process.</p>
    <p>Reply any time — this comes straight to me.</p>
    <p>Morgan<br/>AFRA Visibility<br/>Dallas, TX</p>
  `;

  return sendViaResend({ to: args.to, subject, html, text, replyTo: CONTACT_EMAIL });
}
