import type { Metadata } from "next";
import { LegalPageShell } from "../../components/LegalPageShell";
import { getLegalDocContent } from "../../lib/legalDocs";

export const metadata: Metadata = {
  title: "Terms of Service — AFRA",
};

export default function TermsOfServicePage() {
  return <LegalPageShell content={getLegalDocContent("terms")} />;
}
