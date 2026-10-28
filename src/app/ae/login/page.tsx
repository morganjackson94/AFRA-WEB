import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAe } from "../actions";
import { AeLoginForm } from "./AeLoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AE sign in · AFRA", robots: { index: false, follow: false } };

export default async function AeLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentAe()) redirect(next && /^\/(admin|ae)\//.test(next) ? next : "/ae/new");
  return <AeLoginForm next={next ?? ""} />;
}
