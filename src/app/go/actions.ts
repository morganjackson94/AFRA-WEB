"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PREFILL_COOKIE, PREFILL_COOKIE_MAX_AGE_S, resolvePrefillCode } from "../../lib/aePrefill";
import { prisma } from "../../lib/prisma";

/** The /go form. Same rate-limited lookup as the /go/<code> link (an emailed
 *  code), done here directly: a Server Action can't redirect into a Route
 *  Handler, so it sets the cookie itself and goes straight to review. */
export async function goToCodeAction(formData: FormData): Promise<void> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  const result = await resolvePrefillCode(prisma, String(formData.get("code") ?? ""), ip);
  if (!result.ok) redirect(`/go?e=${result.reason}`);

  (await cookies()).set(PREFILL_COOKIE, result.code, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: PREFILL_COOKIE_MAX_AGE_S,
  });
  redirect("/onboarding?review=1");
}
