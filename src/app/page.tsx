import Image from "next/image";
import Link from "next/link";
import { DemoModal } from "./DemoModal";
import { BackgroundSlideshow } from "../components/BackgroundSlideshow";
import { FaqItem } from "../components/FaqItem";
import { Bell, Bolt, Calendar, Check, Filter } from "../components/Icons";
import { HeroLineBand } from "../components/HeroLineBand";
import { LegalLinks } from "../components/LegalLinks";
import { Reveal } from "../components/Reveal";
import { SectionLabel } from "../components/SectionLabel";
import { Stagger } from "../components/Stagger";
import { countActiveFoundingOperators } from "../lib/activation";
import {
  FOUNDING_OPERATOR_RENEWAL_PRICE_CENTS,
  FOUNDING_RENEWAL_DISCOUNT_RATE,
  FOUNDING_RENEWAL_PRICE_CENTS,
  FOUNDING_SPOTS_TOTAL,
} from "../lib/billing";
import { CONTACT_EMAIL } from "../lib/constants";
import { getLegalDocContent } from "../lib/legalDocs";
import { prisma } from "../lib/prisma";

const SECTION = "mx-auto max-w-[1080px] px-6";
// Major-section rhythm: a warm hairline divider + generous vertical air.
const SECTION_DIVIDED = `${SECTION} border-t border-line py-24 md:py-32`;
// Asymmetric editorial grid: narrow label rail (left) + wide content (right).
const RAIL = "grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-[200px_1fr]";

// Real seat count (see countActiveFoundingOperators — same source of truth
// startOnboardingAction's checkout-time cap reads). This page takes paid Meta
// traffic at volume, so it's ISR (see `revalidate` below), not fetched fresh
// on every single request.
export const revalidate = 60;

// Founding-Operator offer config. Cap + deadline are REAL commitments — honor
// them (don't claim 10 and sell 50). priceAfter is the then-current renewal
// price (docs/CLAIMS.md); priceFounding is what a continuous founding
// operator actually pays after the 25% standing discount — not a locked
// rate; see content/legal/terms.md §7a.
const FOUNDING = {
  priceFirstYear: "$1,990", // annual prepay, billed once, FLAT — covers every location
  monthlyEquivalent: "$166", // light math: 1990 / 12, reassurance only (not billed monthly)
  priceAfter: `$${(FOUNDING_RENEWAL_PRICE_CENTS / 100).toLocaleString("en-US")}/yr`,
  priceFounding: `$${(FOUNDING_OPERATOR_RENEWAL_PRICE_CENTS / 100).toLocaleString("en-US")}/yr`,
  discountPercent: Math.round(FOUNDING_RENEWAL_DISCOUNT_RATE * 100),
  spotsTotal: FOUNDING_SPOTS_TOTAL,
  deadline: "July 31, 2026",
};

// TODO(billing): The Founding-Operator offer is an ANNUAL PREPAY (one-time
// ~$1,990 charge), but Step 3's Stripe integration was built MONTHLY ($199/mo
// recurring). This copy ships now; the billing wiring is a SEPARATE change:
// add an annual Stripe product/price and route founding signups to a one-time
// annual charge instead of the monthly subscription. Do NOT treat monthly as
// annual — provision() currently still starts a monthly trial sub.

function CTA({
  size = "base",
  full = false,
  label = "Claim your spot",
  tone = "accent",
}: {
  size?: "base" | "lg";
  full?: boolean;
  label?: string;
  // "accent" = the lit amber primary (one per view); "outline" = the quiet
  // cream-on-periwinkle treatment for the persistent nav button, so the sticky
  // CTA never competes with each section's single amber moment.
  tone?: "accent" | "outline";
}) {
  return (
    <Link
      href="/onboarding"
      className={`inline-flex items-center justify-center rounded-full font-medium transition duration-150 hover:opacity-90 ${
        tone === "accent"
          ? "border border-accent bg-accent text-accent-ink"
          : "border border-line-strong bg-transparent text-ink hover:bg-cream"
      } ${size === "lg" ? "px-7 py-3.5 text-base" : "px-5 py-2.5 text-[14.5px]"} ${full ? "w-full" : ""}`}
    >
      {label}
    </Link>
  );
}

const FEATURES = [
  { icon: Bolt, title: "Instant replies", body: "Answer every applicant the moment they message, day or night. Reliable, so no one waits." },
  { icon: Filter, title: "Smart screening", body: "A few questions sort the serious applicants from the maybes." },
  { icon: Calendar, title: "Candidates book their own interview", body: "They pick a time you're actually free. It lands on your calendar." },
  { icon: Bell, title: "One-tap reminders", body: "Follow up in one tap, in the same chat. Fewer people ghost, more people show." },
];

const STEPS = [
  { n: "01", h: "Connect your Instagram", p: "It's where applicants already message you. Nothing new for them to download." },
  { n: "02", h: "We answer & screen instantly", p: "Every applicant gets a reply in seconds and a few smart questions, automatically." },
  { n: "03", h: "Candidates book their interview", p: "Good applicants book a time themselves. No phone tag, no chasing." },
];

const FAQ: { q: string; a: string | string[] }[] = [
  { q: "Do I need to run ads?", a: "No. It works with the Instagram posts you already make: comment-to-apply, link in bio, or a QR in your window." },
  { q: "How fast can I actually fill a shift?", a: "As fast as good applicants reply. AFRA answers them instantly, and candidates can book their interview the same day, so you're not waiting days to fill the floor." },
  { q: "What if it doesn't work for me?", a: "You're covered by a 30-day money-back guarantee. Try it for 30 days. If candidates aren't booking interviews with you, ask for a full refund." },
  { q: "How does follow-up work?", a: "Within the first 24 hours the bot replies instantly on its own. After that, following up is one tap: you send the reminder in the same chat. No autopilot chasing, no phone tag." },
  { q: "How long does setup take?", a: "Setup takes about a minute — connect Instagram, pick your role and calendar. You're live and receiving candidates within 7 days, or you don't pay." },
  { q: "How do applicants start the conversation?", a: "They comment or message a keyword on your hiring post. We set it up for you, so there's nothing to configure. If you want a specific word, just ask and we'll change it." },
  { q: "I run several locations. How does that work?", a: "Your founding spot covers all of them. Each location gets its own hiring link and its own pipeline, so applicants land in the right place." },
  { q: "Do I need to connect this to my POS or scheduling system?", a: "No. AFRA works alongside whatever you already use. Candidates and interviews live in your dashboard and your calendar. There is nothing to integrate." },
  { q: "What if I want a refund?", a: "Full refund within 30 days, no questions asked. After that, your year is yours and you are free not to renew." },
  { q: "What happens after the first year?", a: `Your founding year is $1,990. After that, renewal is at our then-current rate — ${FOUNDING.priceAfter} today — but as a founding operator you keep a standing ${FOUNDING.discountPercent}% discount off that price for as long as you stay (that's ${FOUNDING.priceFounding} today), as long as your subscription stays continuous. Never a surprise: we give at least 30 days' notice before any price change, and reach out before your year is up so you can decide.` },
  {
    q: "What exactly do I get as a Founding Operator?",
    a: [
      "Instant replies to every applicant, day or night",
      "Automatic screening, so you only see people worth your time",
      "Candidates book their interview straight into your calendar",
      "One-tap follow-up reminders",
      "One simple dashboard for every location",
      "Personal setup. We build and connect your flow for you.",
      `A standing ${FOUNDING.discountPercent}% discount off then-current pricing, for as long as you stay`,
      "30-day money-back guarantee",
    ],
  },
];

export default async function LandingPage() {
  const activeFoundingCount = await countActiveFoundingOperators(prisma);
  const spotsLeft = Math.max(0, FOUNDING.spotsTotal - activeFoundingCount);
  return (
    // overflow-x-clip lets the enlarged hero phone bleed into the right gutter
    // without producing a horizontal scrollbar. `clip` (not `hidden`) doesn't
    // create a scroll container, so the sticky nav keeps working.
    <div className="bg-bg text-ink overflow-x-clip">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className={`${SECTION} flex items-center justify-between py-4`}>
          <Image
            src="/afra-logo-mark.png"
            alt="AFRA"
            width={809}
            height={230}
            priority
            sizes="100px"
            className="h-7 w-auto"
          />
          <CTA tone="outline" />
        </div>
      </nav>

      {/* Hero — staggered arrival; headline gets the pronounced blur-in settle. */}
      <header className={`${SECTION} grid grid-cols-1 items-center gap-14 pb-20 pt-20 md:grid-cols-[1.05fr_.95fr] md:pt-28`}>
        <div>
          <Reveal delay={0}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-3 py-1.5 text-[13px] font-medium text-ink-soft">
              <span className="size-[7px] rounded-full bg-ink-soft" />
              For restaurants &amp; cafés
            </span>
          </Reveal>
          <Reveal hero delay={120}>
            <h1 className="t-display mb-6">Answer applicants before they apply elsewhere.</h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mb-3 max-w-[40ch] text-[19px] leading-relaxed text-ink-soft">
              Answer every applicant in seconds. Candidates book their interview straight into your
              calendar. Follow up in one tap. No more phone tag.
            </p>
          </Reveal>
          <Reveal delay={360}>
            <p className="mb-8 text-[16px] font-medium text-ink">Fewer no-shows. More shifts filled.</p>
          </Reveal>
          <Reveal delay={480}>
            <div className="flex flex-wrap items-center gap-3">
              <CTA size="lg" />
              <DemoModal variant="ghost" />
            </div>
          </Reveal>
          <Reveal delay={600}>
            <p className="mt-5 text-[13.5px] text-faint">
              30-day money-back guarantee. No ads needed. Setup takes about a minute — live within 7
              days, or you don&apos;t pay.
            </p>
          </Reveal>
        </div>

        {/* Real product screenshot — a transparent (RGBA) phone cutout. No box:
            it floats, with a drop-shadow that hugs the phone silhouette. */}
        <Reveal delay={240}>
          <video
            src="/hero-phone2.mp4"
            poster="/hero-phone.webp"
            autoPlay
            loop
            muted
            playsInline
            aria-label="AFRA screening a job applicant by chat."
            // Up to lg the phone fills its column. From lg it left-anchors and grows
            // past the column (1.5x of the original 460px at xl), bleeding into the
            // empty right gutter; the root's overflow-x-clip hides the spillover.
            className="mx-auto h-auto w-full max-w-[460px] rounded-[2.5rem] lg:mx-0 lg:max-w-none lg:w-[640px] xl:w-[690px] [filter:drop-shadow(0_35px_55px_rgba(0,0,0,0.3))]"
          />
        </Reveal>
      </header>

      {/* VSL */}
      <section className={SECTION_DIVIDED}>
        <div className={RAIL}>
          <Reveal>
            <SectionLabel index="01">See it work</SectionLabel>
          </Reveal>
          <Stagger step={110}>
            <h2 className="t-title mb-8 max-w-[16ch]">See it in 90 seconds.</h2>
            <div>
              <DemoModal variant="poster" />
            </div>
            <p className="mt-4 text-[13.5px] text-faint">
              Optional. The page tells you everything. Watch only if you want to see it move.
            </p>
          </Stagger>
        </div>
      </section>

      {/* Problem strip — full-bleed statement */}
      <section className={`${SECTION} py-24 md:py-32`}>
        <Reveal>
          <div className="rounded-[28px] border border-line bg-card px-8 py-20 text-center text-ink md:px-16">
            <h2 className="t-title mx-auto mb-5 max-w-[24ch] text-ink">
              Your best applicants apply to five places at once.
            </h2>
            <p className="mx-auto max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
              Whoever answers first wins.{" "}
              <span className="font-medium text-rose">Calls go to voicemail. DMs sit for hours.</span>{" "}
              By the time you follow up, they&apos;ve already taken another job.
            </p>
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-soft">
              Applicants who hear back fast feel respected. The ones who feel respected are the ones
              who show up.
            </p>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className={SECTION_DIVIDED}>
        <div className={RAIL}>
          <Reveal>
            <SectionLabel index="02">Questions</SectionLabel>
          </Reveal>
          <Stagger className="flex flex-col gap-3" step={90}>
            <h2 className="t-title mb-4 max-w-[14ch]">The short answers.</h2>
            {FAQ.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </Stagger>
        </div>
      </section>

      {/* Editorial band — cream line-art sketch-on beside the Sandoitchi proof card. */}
      <section className={`${SECTION} pb-8`}>
        <HeroLineBand />
      </section>

      {/* How it works — oversized numbers anchor hairline rows */}
      <section className={SECTION_DIVIDED}>
        <div className={RAIL}>
          <Reveal>
            <SectionLabel index="03">How it works</SectionLabel>
          </Reveal>
          <Stagger step={120}>
            <h2 className="t-title mb-10 max-w-[18ch]">Three steps. Then it runs itself.</h2>
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="grid grid-cols-[64px_1fr] gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 md:grid-cols-[120px_1fr]"
              >
                <div className="font-display text-5xl font-medium leading-none text-ink-soft md:text-6xl">
                  {s.n}
                </div>
                <div>
                  <h3 className="t-heading">{s.h}</h3>
                  <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">{s.p}</p>
                </div>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Features */}
      <section className={SECTION_DIVIDED}>
        <div className={RAIL}>
          <Reveal>
            <SectionLabel index="04">What you get</SectionLabel>
          </Reveal>
          <div>
            <Reveal>
              <h2 className="t-title mb-4 max-w-[16ch]">Simple, and follow-up is one tap.</h2>
            </Reveal>
            <Reveal>
              <p className="mb-8 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
                Instant replies, automatic screening, candidates booking their own interviews. All
                from the Instagram you already use.
              </p>
            </Reveal>
            <Stagger className="grid grid-cols-1 gap-3.5 sm:grid-cols-2" step={90}>
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-4 rounded-2xl border border-line bg-card px-6 py-6">
                <span className="grid size-11 flex-none place-items-center rounded-xl bg-cream text-ink">
                  <f.icon className="size-5" />
                </span>
                <div>
                  <b className="mb-1 block text-[16px] font-semibold">{f.title}</b>
                  <span className="text-[14.5px] leading-relaxed text-ink-soft">{f.body}</span>
                </div>
              </div>
            ))}
            </Stagger>
            <Reveal>
              <p className="mt-6 text-[15px] font-medium text-ink">
                It&apos;s not just candidates booking interviews. It&apos;s people who actually show up.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Pricing — Founding-Operator annual prepay */}
      <section className={SECTION_DIVIDED}>
        <div className={RAIL}>
          <Reveal>
            <SectionLabel index="05">Founding pricing</SectionLabel>
          </Reveal>
          <div>
            <Reveal>
              <h2 className="t-title mb-8 max-w-[18ch]">Founding Operator: first 10 only.</h2>
            </Reveal>
            <Reveal>
            <div className="max-w-[460px] rounded-[28px] border border-line-strong bg-card px-9 py-10 text-center shadow-[0_30px_60px_-40px_rgba(0,0,0,.28)]">
              {/* Scarcity + deadline. Amber is reserved for the CTA below (this view's
                  one amber moment); the scarcity badge carries the dusty-rose
                  secondary, the label chip stays a quiet outline. */}
              <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft">
                  Founding Operator · first {FOUNDING.spotsTotal}
                </span>
                <span className="rounded-full border border-rose/40 bg-cream px-3 py-1.5 text-[12.5px] font-semibold text-rose">
                  {spotsLeft} of {FOUNDING.spotsTotal} spots left
                </span>
              </div>

              <div className="t-price">{FOUNDING.priceFirstYear}</div>
              <div className="mt-2.5 text-[15px] text-ink-soft">
                First year. All your locations. Billed once.
              </div>

              {/* Reassurance framing, not a billing plan: prominent so a cold
                  operator gets the "oh, that's only ~$166/mo" reframe, but
                  visibly secondary to the $1,990 headline they're actually
                  charged (they can't pay monthly — no monthly Stripe path). */}
              <div className="mt-3 text-[18px] font-semibold text-ink">
                That works out to about {FOUNDING.monthlyEquivalent} a month.
              </div>

              {/* Anchor: rises after founding */}
              <div className="mt-3 text-[14px] text-faint">
                <s>{FOUNDING.priceAfter}</s> after founding pricing
              </div>

              {/* Deadline */}
              <div className="mt-5 inline-block rounded-full bg-cream px-3.5 py-1.5 text-[13.5px] font-semibold text-ink">
                Founding pricing ends {FOUNDING.deadline}
              </div>

              <ul className="my-7 flex flex-col gap-3 text-left">
                {[
                  "Instant replies to every applicant",
                  "Automatic screening questions",
                  "Candidates book straight into your calendar",
                  "One-tap follow-up reminders",
                  "One simple dashboard",
                  "Every location you run, one price",
                ].map((li) => (
                  <li key={li} className="flex items-start gap-2.5 text-[15px]">
                    <Check className="mt-0.5 size-[18px] flex-none text-ink-soft" />
                    {li}
                  </li>
                ))}
              </ul>

              <CTA size="lg" full />

              {/* Risk reversal replaces the free trial */}
              <div className="mt-5 rounded-xl border border-line bg-bg px-4 py-4">
                <p className="text-[14px] font-semibold text-ink">30-day money-back guarantee</p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Try it for 30 days. If candidates aren&apos;t booking interviews with you, full refund, no questions.
                </p>
              </div>
              <p className="mt-3 text-[13px] text-faint">
                Paid from day one. The guarantee is your safety net. Cancel inside 30 days for a full refund.
              </p>
            </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Final CTA — full-bleed photo slideshow behind a periwinkle scrim */}
      <section className="relative overflow-hidden border-t border-line py-28 text-center md:py-36">
        <BackgroundSlideshow images={["/bg1.jpg", "/bg2.jpg", "/bg3.jpg", "/bg4.jpg"]} />
        <div className={`${SECTION} relative`}>
          <Stagger step={110}>
            <h2 className="t-title mx-auto max-w-[18ch]">Stop losing applicants.</h2>
            <p className="mx-auto mt-5 mb-8 text-[18px] text-ink-soft">
              Founding pricing ends {FOUNDING.deadline}. {spotsLeft} of {FOUNDING.spotsTotal} spots left.
            </p>
            <div>
              <CTA size="lg" />
            </div>
          </Stagger>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className={`${SECTION} flex flex-wrap items-center justify-between gap-y-3 gap-x-6 py-8 text-[13.5px] text-faint`}>
          <div className="flex items-center gap-3">
            <LegalLinks termsContent={getLegalDocContent("terms")} privacyContent={getLegalDocContent("privacy")} />
            <span aria-hidden="true" className="text-line-strong">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors duration-200 hover:text-ink">
              Contact us
            </a>
          </div>
          <div>© 2026 · Made for operators</div>
        </div>
      </footer>
    </div>
  );
}
