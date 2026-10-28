import { type NextRequest, NextResponse } from "next/server";
import { PREFILL_COOKIE, PREFILL_COOKIE_MAX_AGE_S, resolvePrefillCode } from "../../../lib/aePrefill";
import { prisma } from "../../../lib/prisma";

// afravisibility.com/go/<code>: trade an AE's spoken code for an httpOnly
// cookie, then send the operator to the pre-filled review screen. The code
// leaves the URL right here, so it never lands in /onboarding's history or
// referrers. Failed lookups are rate-limited per IP (aePrefill.ts).
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";

  const result = await resolvePrefillCode(prisma, code, ip);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/go?e=${result.reason}`, request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/onboarding?review=1", request.url), 303);
  response.cookies.set(PREFILL_COOKIE, result.code, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: PREFILL_COOKIE_MAX_AGE_S,
  });
  return response;
}
