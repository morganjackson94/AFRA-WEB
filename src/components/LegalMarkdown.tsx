import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

// Shared prose rendering for the three legal documents — used inside both
// LegalModal (footer/checkout) and the full-page /terms-of-service,
// /privacy-policy, /candidate-notice routes, so the markdown source is
// styled identically everywhere it appears.

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-display mb-4 text-2xl font-semibold text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display mt-8 mb-2 text-lg font-semibold text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-1.5 text-[15px] font-semibold text-ink">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14.5px] leading-relaxed text-ink-soft">{children}</p>
  ),
  ul: ({ children }) => <ul className="mb-3 flex flex-col gap-1.5 pl-5">{children}</ul>,
  li: ({ children }) => (
    <li className="list-disc text-[14.5px] leading-relaxed text-ink-soft marker:text-faint">{children}</li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  hr: () => <hr className="my-6 border-line" />,
};

export function LegalMarkdown({ content }: { content: string }) {
  return <ReactMarkdown components={components}>{content}</ReactMarkdown>;
}
