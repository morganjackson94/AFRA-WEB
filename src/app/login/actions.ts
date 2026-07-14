"use server";

import { redirect } from "next/navigation";
import { createLoginToken } from "../../lib/auth";
import { sendMagicLinkEmail } from "../../lib/mail";
import { prisma } from "../../lib/prisma";
import { appBaseUrl, destroySession } from "../../lib/session";

export type LoginState = { sent?: boolean; error?: string };

// Always returns the same "check your email" outcome whether or not the email
// matches an operator — a login form that reveals which emails have accounts
// is an account-enumeration leak. The magic link only actually sends when the
// operator exists.
export async function requestMagicLinkAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "That email doesn't look right." };

  const operator = await prisma.operator.findUnique({ where: { email }, select: { id: true, email: true } });
  if (operator) {
    const token = await createLoginToken(prisma, operator.id);
    const verifyUrl = `${appBaseUrl()}/login/verify?token=${token}`;
    await sendMagicLinkEmail({ to: operator.email, verifyUrl });
  }

  return { sent: true };
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
