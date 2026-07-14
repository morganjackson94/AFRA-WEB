import type { Metadata } from "next";
import { LegalMarkdown } from "../../components/LegalMarkdown";
import { getLegalDocContent } from "../../lib/legalDocs";

export const metadata: Metadata = {
  title: "Candidate Data Notice — AFRA",
};

// Full standalone page, not a modal — this is opened from a link inside the
// ManyChat opening-disclosure message, on mobile, usually inside an in-app
// Messenger browser. No "back to site" link: candidates didn't arrive by
// browsing afravisibility.com, so there's nothing meaningful to return to.
export default function CandidateNoticePage() {
  return (
    <main className="mx-auto min-h-screen max-w-[680px] px-6 py-16 text-ink">
      <LegalMarkdown content={getLegalDocContent("candidateNotice")} />
    </main>
  );
}
