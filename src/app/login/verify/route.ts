import { NextRequest, NextResponse } from "next/server";
import { consumeLoginToken } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { createSession } from "../../../lib/session";

// Magic-link landing. GET so it works as a plain email link. Consumes the
// token exactly once (see auth.ts) and creates a real session on success.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing", request.url));
  }

  const result = await consumeLoginToken(prisma, token);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/login?error=${result.reason}`, request.url));
  }

  await createSession(result.operatorId);
  // Fixed allowlist, never a caller-supplied path (no open redirect): emails
  // that point at cancel/billing pass ?to=billing to land on that section.
  const to = request.nextUrl.searchParams.get("to") === "billing" ? "/dashboard#billing" : "/dashboard";
  return NextResponse.redirect(new URL(to, request.url));
}
