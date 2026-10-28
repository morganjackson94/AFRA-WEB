"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  AE_COOKIE,
  AE_COOKIE_MAX_AGE_S,
  aeCookieValue,
  createPrefill,
  findAeByPassphrase,
  RATE_LIMIT_MAX_FAILURES,
  RATE_LIMIT_WINDOW_MS,
  verifyAeCookie,
} from "../../lib/aePrefill";
import { hashToken } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { appBaseUrl } from "../../lib/session";

export type AeLoginState = { error?: string };
export type AeIntakeState =
  | { ok?: undefined; error?: string }
  | { ok: true; code: string; link: string; email: string; expiresAt: string; aeId: string };

/** The signed-in AE's id, or null. */
export async function currentAe(): Promise<string | null> {
  return verifyAeCookie((await cookies()).get(AE_COOKIE)?.value);
}

export async function aeLoginAction(_prev: AeLoginState, formData: FormData): Promise<AeLoginState> {
  // Same per-IP failure limit as code lookups (PrefillAttempt), under its own key.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = hashToken(`ae-login-ip:${ip}`);
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const failures = await prisma.prefillAttempt.count({ where: { ipHash, createdAt: { gt: since } } });
  if (failures >= RATE_LIMIT_MAX_FAILURES) return { error: "Too many tries. Wait 10 minutes." };

  const aeId = findAeByPassphrase(String(formData.get("passphrase") ?? ""));
  const value = aeId ? aeCookieValue(aeId) : null;
  if (!aeId || !value) {
    await prisma.prefillAttempt.create({ data: { ipHash } });
    return { error: "That passphrase didn't work." };
  }

  (await cookies()).set(AE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: AE_COOKIE_MAX_AGE_S,
  });
  // Only ever back into our own team pages — never an arbitrary URL.
  const next = String(formData.get("next") ?? "");
  redirect(/^\/(admin|ae)(\/[A-Za-z0-9_-]*)*$/.test(next) ? next : "/ae/new");
}

export async function aeLogoutAction(): Promise<void> {
  (await cookies()).delete(AE_COOKIE);
  redirect("/ae/login");
}

const list = (formData: FormData, key: string) =>
  formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);

export async function createPrefillAction(_prev: AeIntakeState, formData: FormData): Promise<AeIntakeState> {
  const aeId = await currentAe();
  if (!aeId) return { error: "You've been signed out. Reload the page and sign in again." };

  const roles = list(formData, "roles");
  const otherRole = String(formData.get("otherRole") ?? "").trim();
  if (otherRole) roles.push(otherRole);

  const result = await createPrefill(prisma, aeId, {
    email: String(formData.get("email") ?? ""),
    businessName: String(formData.get("businessName") ?? ""),
    locationsBucket: String(formData.get("locationsBucket") ?? ""),
    primaryState: String(formData.get("primaryState") ?? ""),
    hasNycLocation: formData.get("hasNycLocation") === "on",
    roles,
    pay: String(formData.get("pay") ?? ""),
    disqualifiers: list(formData, "disqualifiers"),
    handle: String(formData.get("handle") ?? ""),
    followerBand: String(formData.get("followerBand") ?? ""),
    hiringFrequency: String(formData.get("hiringFrequency") ?? ""),
    calendarChoice: String(formData.get("calendarChoice") ?? ""),
    bookingLinkUrl: String(formData.get("bookingLinkUrl") ?? ""),
  });
  if (!result.ok) return { error: result.error };

  return {
    ok: true,
    code: result.code,
    link: `${appBaseUrl()}/go/${result.code}`,
    email: result.email,
    expiresAt: result.expiresAt.toISOString(),
    aeId,
  };
}
