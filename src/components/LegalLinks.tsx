"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// react-markdown (~29KB unused-on-load per Lighthouse) only matters once
// someone actually opens Terms/Privacy — code-split it out of the initial
// homepage bundle instead of shipping it to every visitor who never clicks
// the footer.
const LegalModal = dynamic(() => import("./LegalModal").then((m) => m.LegalModal));

// Terms of Service + Privacy Policy trigger links, backed by the ONE shared
// LegalModal. Reused as-is in the footer (marketing + dashboard) and inline
// in the checkout consent line — same component, same modal, two layouts.

// Footer: quiet, normal-case, normal letter-spacing — no underline at rest,
// just a color lift to full ink on hover. Sized off the ambient footer text
// (set by the wrapping row in page.tsx / dashboard/layout.tsx), not a
// standalone typographic treatment.
const footerLinkClass = "transition-colors duration-200 hover:text-ink";
// Consent (inline, mid-sentence): a conventional underline still reads
// correctly here — it's inside prose, not a standalone nav row.
const consentLinkClass = "underline underline-offset-2 hover:opacity-80";

export function LegalLinks({
  termsContent,
  privacyContent,
  variant = "footer",
}: {
  termsContent: string;
  privacyContent: string;
  variant?: "footer" | "consent";
}) {
  const [open, setOpen] = useState<"terms" | "privacy" | null>(null);
  const linkClass = variant === "footer" ? footerLinkClass : consentLinkClass;

  // stopPropagation matters for the "consent" variant: it's used inside a
  // <label> wrapping the agreement checkbox, and without this, clicking a
  // link would bubble up and toggle the checkbox via the label's implicit
  // activation behavior — reading the terms shouldn't silently (un)check it.
  const termsButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen("terms");
      }}
      className={linkClass}
    >
      Terms of Service
    </button>
  );
  const privacyButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen("privacy");
      }}
      className={linkClass}
    >
      Privacy Policy
    </button>
  );

  return (
    <>
      {variant === "footer" ? (
        <div className="flex items-center gap-3">
          {termsButton}
          <span aria-hidden="true" className="text-line-strong">·</span>
          {privacyButton}
        </div>
      ) : (
        <>
          {termsButton} and {privacyButton}
        </>
      )}

      {open === "terms" && (
        <LegalModal title="Terms of Service" content={termsContent} onClose={() => setOpen(null)} />
      )}
      {open === "privacy" && (
        <LegalModal title="Privacy Policy" content={privacyContent} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
