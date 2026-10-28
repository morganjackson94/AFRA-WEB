import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAe } from "../actions";
import { AeIntakeForm } from "./AeIntakeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New setup code · AFRA", robots: { index: false, follow: false } };

export default async function AeNewPage() {
  const aeId = await currentAe();
  if (!aeId) redirect("/ae/login");
  return <AeIntakeForm aeId={aeId} />;
}
