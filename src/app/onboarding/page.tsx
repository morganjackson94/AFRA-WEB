import { OnboardingWizard } from "./OnboardingWizard";
import { getLegalDocContent } from "../../lib/legalDocs";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <OnboardingWizard
      termsContent={getLegalDocContent("terms")}
      privacyContent={getLegalDocContent("privacy")}
    />
  );
}
