"use server";

import { redirect } from "next/navigation";
import { createLoginToken } from "../../lib/auth";
import { normalizeEmail } from "../../lib/constants";
import { sendMagicLinkEmail } from "../../lib/mail";
import { prisma } from "../../lib/prisma";
import { appBaseUrl, destroySession } from "../../lib/session";

export type LoginState = { sent?: boolean; error?: string };

// A rapid double-submit (double-click, impatient resubmit) must not send two
// emails for one intent — if a still-valid token was issued this recently,
// treat it as already in flight rather than issuing + sending another.
const RESEND_DEBOUNCE_MS = 30_000;

// Always returns the same "check your email" outcome whether or not the email
// matches an operator — a login form that reveals which emails have accounts
// is an account-enumeration leak. The magic link only actually sends when the
// operator exists.
export async function requestMagicLinkAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Normalized the same way onboarding now normalizes at write time
  // (normalizeEmail, constants.ts) — this lookup is case-sensitive at the DB
  // level (Operator.email has a backing unique index on lower(email), but
  // Prisma's findUnique below still compares the literal column), so an
  // un-normalized stored value and an un-normalized typed value must still
  // both be lowercased to match. This was the actual bug: onboarding didn't
  // normalize on write, so a mobile keyboard's auto-capitalized email was
  // stored mixed-case and silently never matched here — findUnique returned
  // null, sendMagicLinkEmail was never called, and this function still
  // returned {sent:true} by design, making the failure invisible.
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email || !email.includes("@")) return { error: "That email doesn't look right." };

  const operator = await prisma.operator.findUnique({ where: { email }, select: { id: true, email: true } });
  if (operator) {
    const recent = await prisma.loginToken.findFirst({
      where: {
        operatorId: operator.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - RESEND_DEBOUNCE_MS) },
      },
      select: { id: true },
    });

    if (recent) {
      console.log(`[magic-link] debounced repeat request for operator ${operator.id} — a token issued within the last ${RESEND_DEBOUNCE_MS / 1000}s is still valid`);
    } else {
      try {
        const token = await createLoginToken(prisma, operator.id);
        const verifyUrl = `${appBaseUrl()}/login/verify?token=${token}`;
        console.log(`[magic-link] attempting send to operator ${operator.id}`);
        const result = await sendMagicLinkEmail({ to: operator.email, verifyUrl });
        if (result.sent) {
          console.log(`[magic-link] sent to operator ${operator.id}`);
        } else {
          console.error(`[magic-link] send did not complete for operator ${operator.id} (stub=${result.stub ?? false})`);
        }
      } catch (err) {
        // Never let a mail-provider failure surface here — the response
        // below must stay the same generic "check your email" outcome
        // regardless, both for the account-enumeration reason above and so a
        // transient Resend error doesn't turn into a visible login error.
        console.error(`[magic-link] send threw for operator ${operator.id}:`, err);
      }
    }
  }

  return { sent: true };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
