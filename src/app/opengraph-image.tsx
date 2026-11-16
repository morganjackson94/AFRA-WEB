import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Site-wide default share card (Open Graph; twitter-image.tsx re-exports it).
// Text only — no photos, no external services. Copy is approved verbatim
// (docs/CLAIMS.md). The "~$4,000 in value" line is deliberately left off: it
// needs its footnote, and a footnote can't live on a share image. Fonts are
// committed static TTFs (src/assets/fonts) so nothing is fetched at build.

export const alt = "7 hires in two weeks. One post and a story.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Wrap units: each number stays on the same line as its noun ("7 hires").
const HEADLINE: { lead?: string; text: string }[] = [
  { lead: "7", text: "hires" },
  { text: "in" },
  { text: "two" },
  { text: "weeks." },
  { text: "One" },
  { text: "post" },
  { text: "and" },
  { text: "a" },
  { text: "story." },
];
const SUBLINE = "sandoitchi, Houston · 38 applicants · $0 in ads";

// Colors come from the site's own tokens in globals.css rather than being
// retyped here, so the card can't drift from the page.
async function siteTokens() {
  const css = await readFile(join(process.cwd(), "src/app/globals.css"), "utf8");
  const token = (name: string) => {
    const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    if (!m) throw new Error(`opengraph-image: --color-${name} not found in globals.css`);
    return m[1];
  };
  return { ink: token("ink"), bg: token("bg"), accent: token("accent") };
}

const font = (file: string) => readFile(join(process.cwd(), "src/assets/fonts", file));

export default async function Image() {
  const [{ ink, bg, accent }, garamond500, garamond600, manrope500] = await Promise.all([
    siteTokens(),
    font("EBGaramond-Medium.ttf"),
    font("EBGaramond-SemiBold.ttf"),
    font("Manrope-Medium.ttf"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: ink,
          color: bg,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Word-per-item so "7" can carry the amber accent, as on the page. */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontFamily: "EB Garamond",
              fontWeight: 500,
              fontSize: 104,
              lineHeight: 1.06,
              letterSpacing: "-0.01em",
              maxWidth: 1040,
            }}
          >
            {HEADLINE.map((w, i) => (
              <div key={i} style={{ display: "flex", marginRight: 26 }}>
                {w.lead && (
                  <span style={{ marginRight: 26, color: w.lead === "7" ? accent : bg }}>{w.lead}</span>
                )}
                <span>{w.text}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 34, fontFamily: "Manrope", fontWeight: 500, fontSize: 32, opacity: 0.82 }}>
            {SUBLINE}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ fontFamily: "EB Garamond", fontWeight: 600, fontSize: 44, letterSpacing: "0.02em" }}>
            AFRA
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "EB Garamond", data: garamond500, weight: 500, style: "normal" },
        { name: "EB Garamond", data: garamond600, weight: 600, style: "normal" },
        { name: "Manrope", data: manrope500, weight: 500, style: "normal" },
      ],
    },
  );
}
