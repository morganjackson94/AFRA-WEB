import type { Metadata } from "next";
import { LegalPageShell } from "../../components/LegalPageShell";
import { getLegalDocContent } from "../../lib/legalDocs";

export const metadata: Metadata = {
  title: "Privacy Policy — AFRA",
};

export default function PrivacyPolicyPage() {
  return <LegalPageShell content={getLegalDocContent("privacy")} />;
}
