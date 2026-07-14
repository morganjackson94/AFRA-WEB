import { LegalLinks } from "../../components/LegalLinks";
import { getLegalDocContent } from "../../lib/legalDocs";

// Wraps every /dashboard/* route with a shared footer carrying the two
// operator-facing legal links (Terms + Privacy). Deliberately NOT the
// Candidate Data Notice — operators are the dashboard's audience, not
// candidates (see /candidate-notice, linked from ManyChat instead).
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-faint">
          <LegalLinks termsContent={getLegalDocContent("terms")} privacyContent={getLegalDocContent("privacy")} />
          <span>© 2026 AFRA</span>
        </div>
      </footer>
    </>
  );
}
