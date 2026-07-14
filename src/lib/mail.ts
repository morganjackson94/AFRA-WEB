// Outbound email seam. Same honesty pattern as channel.ts/calendar.ts: a real
// send when RESEND_API_KEY is configured (a single fetch call — no SDK needed),
// and an explicit console-logged stub otherwise so local dev/testing works
// without an email provider. The stub NEVER pretends to have sent anything.

export type SendResult = { sent: boolean; stub?: boolean };

const FROM = process.env.MAIL_FROM ?? "AFRA <login@afravisibility.com>";

async function sendViaResend(args: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
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
    body: JSON.stringify({ from: FROM, to: args.to, subject: args.subject, html: args.html, text: args.text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[mail:ERROR] Resend send failed (${res.status}): ${body}`);
    return { sent: false };
  }
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
