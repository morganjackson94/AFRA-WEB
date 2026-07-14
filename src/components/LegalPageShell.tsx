import Link from "next/link";
import { LegalMarkdown } from "./LegalMarkdown";

// Shared shell for the standalone legal-document routes (/terms-of-service,
// /privacy-policy, /candidate-notice) — same LegalMarkdown renderer the modal
// uses, just full-page instead of dialog chrome. These exist as real URLs
// (not only footer modals) because the documents themselves link to each
// other by absolute URL, and the Candidate Notice is reached from a mobile
// Messenger link, not by browsing the site.

export function LegalPageShell({ content, backHref = "/" }: { content: string; backHref?: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-[680px] px-6 py-16 text-ink">
      <Link href={backHref} className="mb-10 inline-block text-[13.5px] text-ink-soft hover:text-ink">
        ← Back
      </Link>
      <LegalMarkdown content={content} />
    </main>
  );
}
