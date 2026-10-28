import { cookies } from "next/headers";
import { OnboardingWizard, type WizardPrefill } from "./OnboardingWizard";
import { getLegalDocContent } from "../../lib/legalDocs";
import { loadPrefillDraft, PREFILL_COOKIE } from "../../lib/aePrefill";
import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // AE pre-filled link: /go/<code> set the cookie and sent them here with
  // ?review=1. The cookie (not the URL) carries the code, so nothing personal
  // is ever in a link. An expired or used code just falls back to the normal
  // wizard.
  let prefill: WizardPrefill | null = null;
  if (params.review === "1") {
    const draft = await loadPrefillDraft(prisma, (await cookies()).get(PREFILL_COOKIE)?.value).catch(() => null);
    if (draft) prefill = { answers: { ...draft.answers, email: draft.email }, aeRef: draft.aeRef, canceled: params.canceled === "1" };
  }

  return (
    <OnboardingWizard
      termsContent={getLegalDocContent("terms")}
      privacyContent={getLegalDocContent("privacy")}
      prefill={prefill}
    />
  );
}
