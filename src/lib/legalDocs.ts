import { readFileSync } from "node:fs";
import { join } from "node:path";

// Single source of truth for the three attorney-drafted legal documents.
// Content lives in /content/legal/*.md (edited once there after attorney
// review) — never duplicate this copy inline in a component. Read at request
// time (files are tiny; no need for a build step or CMS).

export const LEGAL_DOC_IDS = ["terms", "privacy", "candidateNotice"] as const;
export type LegalDocId = (typeof LEGAL_DOC_IDS)[number];

const LEGAL_DOC_FILES: Record<LegalDocId, string> = {
  terms: "terms.md",
  privacy: "privacy.md",
  candidateNotice: "candidate-notice.md",
};

export const LEGAL_DOC_TITLES: Record<LegalDocId, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  candidateNotice: "Candidate Data Notice",
};

// The "Effective Date" shared by all three documents as of this writing. Bump
// this (and re-check it still matches all three files) whenever the legal
// docs are revised, so recorded consent (Operator.tosVersion) stays
// distinguishable from what a later revision says.
export const LEGAL_DOC_VERSION = "2026-07-28";

/** Reads a legal document's markdown source. Server-only (uses fs). */
export function getLegalDocContent(id: LegalDocId): string {
  const path = join(process.cwd(), "content", "legal", LEGAL_DOC_FILES[id]);
  return readFileSync(path, "utf-8");
}
