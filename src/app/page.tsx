import Image from "next/image";
import { DemoModal } from "./DemoModal";
import { BackgroundSlideshow } from "../components/BackgroundSlideshow";
import { CountUp } from "../components/CountUp";
import { CTA } from "../components/CTA";
import { FaqItem } from "../components/FaqItem";
import { Bell, Bolt, Check, Filter, Instagram } from "../components/Icons";
import { LandingViewTracker } from "../components/LandingViewTracker";
import { LegalLinks } from "../components/LegalLinks";
import { Magnetic } from "../components/Magnetic";
import { RaceNarrative } from "../components/RaceNarrative";
import { StepsSketch } from "../components/StepsSketch";
import { Reveal } from "../components/Reveal";
import { Stagger } from "../components/Stagger";
import { ANNUAL_PRICE_CENTS, FREE_CANDIDATE_CAP, TRIAL_DAYS_BACKSTOP } from "../lib/billing";
import { CONTACT_EMAIL } from "../lib/constants";
import { getLegalDocContent } from "../lib/legalDocs";

const SECTION = "mx-auto max-w-[1120px] px-6";
// Major-section rhythm: a warm hairline divider + generous vertical air.
const SECTION_DIVIDED = `${SECTION} border-t border-line py-24 md:py-32`;

// Standing annual price (see docs/CLAIMS.md, entry dated 2026-09 reversing
// the prior ban on annual framing). $399/mo was a real subscription too — a
// genuine free trial (FREE_CANDIDATE_CAP screened candidates, up to
// TRIAL_DAYS_BACKSTOP days) needs a subscription, not a one-time charge,
// regardless of interval — so switching the interval to annual doesn't
// disturb the trial mechanism at all. Approved framing keeps the monthly
// figure as an anchor: "$4,788/year — about $399/month" — so both are
// derived here, never hand-typed at call sites.
const PRICING = {
  priceAnnual: `$${(ANNUAL_PRICE_CENTS / 100).toLocaleString("en-US")}`, // $4,788
  priceMonthlyEquivalent: `$${Math.round(ANNUAL_PRICE_CENTS / 12 / 100)}`, // $399
  freeCandidateCap: FREE_CANDIDATE_CAP,
  trialDaysBackstop: TRIAL_DAYS_BACKSTOP,
};

// The founder's own sales-call calendar — distinct from Operator.
// bookingLinkUrl (each operator's own candidate-interview booking link, set
// during onboarding). Renders nothing when unset rather than a dead link.
// Deliberately a quiet text link, never competing with the primary CTA.
function BookACallLink({ className = "" }: { className?: string }) {
  const url = process.env.SALES_CALL_URL;
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-[14.5px] font-medium text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink ${className}`}
    >
      Book a call with us
    </a>
  );
}

// Bento cells below render these four; the image cell carries the booking
// feature (the most visual of the four), the rest are text cells with
// deliberately varied grounds so the grid has rhythm, not four twins.
const FEATURES = {
  replies: {
    icon: Bolt,
    title: "Instant replies",
    body: "Answer every applicant the moment they message, day or night. Reliable, so no one waits.",
  },
  screening: {
    icon: Filter,
    title: "Smart screening",
    body: "A few questions sort the serious applicants from the maybes.",
  },
  reminders: {
    icon: Bell,
    title: "One-tap reminders",
    body: "Follow up in one tap, in the same chat. Fewer people ghost, more people show.",
  },
  booking: {
    title: "Candidates book their own interview",
    body: "They pick a time you're actually free. It lands on your calendar.",
  },
};

// The single real result from Sandoitchi's pilot — do not fabricate or alter
// these numbers; if more proof arrives later it becomes its own honest
// addition, not more content jammed in here. Source + methodology:
// docs/CLAIMS.md. Deliberately never rendered as a percentage and never
// described as "qualified" — "58" here is a raw candidate count, not a rate.
const PROOF = {
  stat: 58,
  statLabel: "candidates in 3 days",
  statSub: "From one Instagram story post. Zero ad spend.",
  caption: "sandoitchi, Dallas. One location.",
};

const STEPS = [
  { n: "01", h: "Connect your Instagram", p: "It's where applicants already message you. Nothing new for them to download." },
  { n: "02", h: "We answer & screen instantly", p: "Every applicant gets a reply in seconds and a few smart questions, automatically." },
  { n: "03", h: "Candidates book their interview", p: "Good applicants book a time themselves. No phone tag, no chasing." },
];

// Switching-cost objection handling, placed inside the mechanism section
// (not a new one) since it lands right after someone learns how the
// three steps work. A structural claim about what AFRA does, not a claim
// about live operator volume — see docs/CLAIMS.md's delivery-status note.
const STEPS_NOTE =
  "AFRA doesn't ask you to change how you hire. It runs on the Instagram you already use and puts screened candidates straight into the process you already have.";

const FAQ: { q: string; a: string | string[] }[] = [
  { q: "Do I need to run ads?", a: "No. It works with the Instagram posts you already make: comment-to-apply, link in bio, or a QR in your window." },
  { q: "How fast can I actually fill a shift?", a: "As fast as good applicants reply. AFRA answers them instantly, and candidates can book their interview the same day, so you're not waiting days to fill the floor." },
  { q: "What if it doesn't work for me?", a: "Your first 20 screened candidates are free, for up to 60 days. If it's not working, cancel any time before then and you're never charged. You only start paying once you've seen it work." },
  { q: "How does follow-up work?", a: "Within the first 24 hours the bot replies instantly on its own. After that, following up is one tap: you send the reminder in the same chat. No autopilot chasing, no phone tag." },
  { q: "How long does setup take?", a: "Setup takes about a minute: connect Instagram, pick your role and calendar. You're live and receiving candidates within 7 days." },
  { q: "How do applicants start the conversation?", a: "They comment or message a keyword on your hiring post. We set it up for you, so there's nothing to configure. If you want a specific word, just ask and we'll change it." },
  { q: "I run several locations. How does that work?", a: "Your plan covers all of them. Each location gets its own hiring link and its own pipeline, so applicants land in the right place." },
  { q: "Do I need to connect this to my POS or scheduling system?", a: "No. AFRA works alongside whatever you already use. Candidates and interviews live in your dashboard and your calendar. There is nothing to integrate." },
  { q: "What counts as a candidate?", a: "Someone who completes your screening and passes it. Applicants who don't meet your bar don't count against your free 20." },
  { q: "What happens after my free trial?", a: "Once you've screened 20 candidates or 60 days pass, whichever comes first, billing starts at $4,788/year (about $399/month) on the card you added at signup. You can cancel any time — canceling during the trial means you're never charged; canceling after means you're not renewed the following year, and you keep access through the year you paid for." },
  { q: "How does billing work?", a: "$4,788/year (about $399/month), covering every location, starting once your trial ends. One flat rate, no per-location fees. Cancel any time from your dashboard — cancellation takes effect at the end of your current year, and you keep access through then." },
  {
    q: "What exactly do I get?",
    a: [
      "Instant replies to every applicant, day or night",
      "Automatic screening, so you only see people worth your time",
      "Candidates book their interview straight into your calendar",
      "One-tap follow-up reminders",
      "One simple dashboard for every location",
      "Personal setup. We build and connect your flow for you.",
      "First 20 screened candidates free",
    ],
  },
];

export default function LandingPage() {
  return (
    // overflow-x-clip lets the enlarged hero phone bleed into the right gutter
    // without producing a horizontal scrollbar. `clip` (not `hidden`) doesn't
    // create a scroll container, so the sticky nav keeps working.
    <div className="bg-bg text-ink overflow-x-clip">
      <LandingViewTracker />
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
            // The logo asset is a cream mark cut for the old dark ground;
            // invert() lands it at a near-navy on paper. Interim until a
            // navy cut of the mark exists as its own asset.
            className="h-7 w-auto invert"
          />
          <CTA id="nav" tone="outline" />
        </div>
      </nav>

      {/* Hero — full-width poster headline (two lines, never more: the scale
          is planned around the line count, per the hero-scale discipline),
          then an asymmetric row: subtext + CTAs left, real product video
          right. Max 4 text elements (headline, subtext, CTAs): guarantee and
          setup reassurance live in pricing and the FAQ, not under the
          buttons. */}
      <header className={`${SECTION} pb-16 pt-12 md:pb-20 md:pt-20`}>
        <Reveal hero delay={120}>
          {/* Scale is capped (not the global t-display max) so this exact
              headline holds two balanced lines at every desktop width. */}
          <h1 className="t-display mb-10 max-w-[24ch] text-[clamp(3rem,6.5vw,5.25rem)] md:mb-14">
            Answer applicants before they apply elsewhere.
          </h1>
        </Reveal>
        <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[1fr_0.9fr] md:gap-16">
          <div className="md:pt-6">
            <Reveal delay={280}>
              <p className="mb-9 max-w-[38ch] text-[18px] leading-relaxed text-ink-soft">
                Answer every applicant in seconds. Candidates book their interview straight into
                your calendar. Follow up in one tap.
              </p>
            </Reveal>
            <Reveal delay={420}>
              <div className="flex flex-wrap items-center gap-3">
                <Magnetic>
                  <CTA id="hero" size="lg" />
                </Magnetic>
                <DemoModal variant="ghost" />
              </div>
              <BookACallLink className="mt-5 block" />
            </Reveal>
          </div>

          {/* Real product screenshot — a transparent (RGBA) phone cutout. No
              box: it floats, with a drop-shadow hugging the phone silhouette,
              bleeding into the right gutter (root's overflow-x-clip hides the
              spillover). */}
          <Reveal delay={240}>
            <video
              src="/hero-phone3.mp4"
              poster="/hero-phone.webp"
              autoPlay
              loop
              muted
              playsInline
              aria-label="AFRA screening a job applicant by chat."
              className="mx-auto h-auto w-full max-w-[420px] rounded-[2.5rem] lg:mx-0 lg:max-w-none lg:w-[560px] [filter:drop-shadow(0_30px_50px_rgba(38,38,63,0.22))]"
            />
          </Reveal>
        </div>
      </header>

      {/* Problem — the page's one pinned, scroll-told moment: the race story
          in three beats. Everything else on the page scrolls normally. */}
      <section className="border-t border-line">
        <RaceNarrative />

        {/* Coda — the abandonment framing, static and quiet after the pinned
            release. Sourced (iCIMS 2025 State of Frontline Hiring: 68%
            hospitality application abandonment), stated at the "about two
            thirds" level of generality that doesn't need a citation on-page.
            Deliberately NOT the "Gen Z attention span" framing — that's a
            generational claim, not a fact about the application experience,
            and it's condescending to the exact people operators want to hire.
            Sandoitchi's own numbers (PROOF) are a separate, distinct data
            point — never blended into this industry-wide claim. */}
        <div className={`${SECTION} pb-24 md:pb-32`}>
          <Reveal>
            <div className="mx-auto max-w-[52ch] border-t border-line pt-14 text-center md:pt-16">
              <h2 className="t-heading text-ink">Most applicants never finish a long application.</h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-ink-soft">
                In hospitality, about two thirds of started applications are abandoned. The industry
                with the most urgent hiring has the worst application experience.
              </p>
              <p className="mt-3 text-[15.5px] leading-relaxed text-ink-soft">
                Your applicants are on their phones, in Instagram. AFRA meets them there: a two
                minute conversation instead of a form they will never finish.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* VSL */}
      <section className={SECTION_DIVIDED}>
        <Stagger step={110}>
          <h2 className="t-title mb-10 max-w-[28ch]">This is your new screener.</h2>
          <div>
            <DemoModal variant="poster" />
          </div>
        </Stagger>
      </section>

      {/* How it works — oversized numerals anchor hairline rows while the
          café line-art draws itself in a sticky column alongside, stroke by
          stroke, at scroll pace: the drawing completes as the setup story
          does. A real sequence, so the numbers carry information. */}
      <StepsSketch title="Three steps. Then it runs itself." steps={STEPS} note={STEPS_NOTE} />

      {/* Proof — image-led asymmetric split: the real storefront on one side,
          the one sourced number counting up on the other. Amber stays
          reserved for that numeral — the single accent this view carries. */}
      <section className={SECTION_DIVIDED}>
        <Reveal>
          {/* Numeral treatment signals this is the first entry in an ongoing
              proof series, not the only one that will ever exist — structure
              only, no invented case studies 02/03. */}
          <p className="t-label mb-5">Case study No. 01</p>
          <h2 className="t-title mb-12 max-w-[20ch]">What happened at sandoitchi.</h2>
        </Reveal>
        <Stagger className="grid grid-cols-1 items-start gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-14" step={120}>
          <figure>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-line">
              <Image
                src="/sandoitchi-storefront.jpg"
                alt="sandoitchi storefront, Dallas"
                fill
                sizes="(max-width: 768px) 100vw, 420px"
                className="object-cover"
              />
            </div>
            <figcaption className="mt-3 text-[13.5px] text-faint">{PROOF.caption}</figcaption>
          </figure>

          <div className="md:pt-2">
            <div className="flex items-baseline gap-4">
              <CountUp
                to={PROOF.stat}
                className="font-display text-[clamp(5rem,12vw,10rem)] font-medium leading-none tracking-[-0.01em] text-accent"
              />
              <span className="t-heading max-w-[10ch] text-ink">{PROOF.statLabel}</span>
            </div>
            <p className="mt-5 max-w-[38ch] text-[17px] leading-relaxed text-ink-soft">{PROOF.statSub}</p>

            {/* The applicant's side — a FACTUAL description of the product
                experience. Never format this as a quotation or attribute it
                to a person. Copy deliberately answers the operator concern
                (from operator conversations, 2026-08): they want a reference
                point on each candidate's experience, so this leads with the
                answers they receive, not "no resume" as a perk. Claim-safe:
                candidates' screening answers really do land in the dashboard
                (docs/CLAIMS.md, screening capability). */}
            <div className="mt-10 rounded-2xl border border-line bg-card px-7 pb-8 pt-6">
              <span className="mb-4 grid size-10 place-items-center rounded-xl bg-cream text-ink">
                <Instagram className="size-5" />
              </span>
              <h3 className="t-heading">Two minutes for them. A clear picture for you.</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                Applicants answer your screening questions in the app they already have open, and
                every answer lands with them in your dashboard. Their experience, availability, and
                dealbreakers, in their own words, before the interview.
              </p>
            </div>
          </div>
        </Stagger>
      </section>

      {/* Features — asymmetric bento (2+1 / 1+2), grounds deliberately varied
          so the grid has rhythm: amber-tinted lead cell, plain card, inset
          cream, and a real-photo cell for the booking feature. */}
      <section className={SECTION_DIVIDED}>
        <Reveal>
          <h2 className="t-title mb-4 max-w-[22ch]">Simple, and follow-up is one tap.</h2>
        </Reveal>
        <Reveal>
          <p className="mb-10 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
            Instant replies, automatic screening, candidates booking their own interviews. All from
            the Instagram you already use.
          </p>
        </Reveal>
        <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-3" step={100}>
          {/* Lead cell — amber-tinted, spans 2. */}
          <div className="rounded-2xl border border-[rgba(196,118,40,0.35)] bg-accent-soft p-8 md:col-span-2">
            <span className="mb-5 grid size-11 place-items-center rounded-xl bg-accent text-accent-ink">
              <FEATURES.replies.icon className="size-5" />
            </span>
            <h3 className="t-heading">{FEATURES.replies.title}</h3>
            <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">{FEATURES.replies.body}</p>
          </div>

          <div className="rounded-2xl border border-line bg-card p-8">
            <span className="mb-5 grid size-11 place-items-center rounded-xl bg-cream text-ink">
              <FEATURES.screening.icon className="size-5" />
            </span>
            <h3 className="text-[18px] font-semibold">{FEATURES.screening.title}</h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">{FEATURES.screening.body}</p>
          </div>

          <div className="rounded-2xl border border-line bg-cream p-8">
            <span className="mb-5 grid size-11 place-items-center rounded-xl bg-card text-ink">
              <FEATURES.reminders.icon className="size-5" />
            </span>
            <h3 className="text-[18px] font-semibold">{FEATURES.reminders.title}</h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-soft">{FEATURES.reminders.body}</p>
          </div>

          {/* Photo cell — real image under a paper wash (the Hermès move:
              pale scrim, dark text) so ink text stays AA over the photo. */}
          <div className="relative min-h-[240px] overflow-hidden rounded-2xl border border-line md:col-span-2">
            <Image
              src="/bg2.jpg"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 720px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(252,247,241,0.96)] via-[rgba(252,247,241,0.62)] to-[rgba(252,247,241,0.15)]" />
            <div className="relative flex h-full flex-col justify-end p-8">
              <h3 className="t-heading text-ink">{FEATURES.booking.title}</h3>
              <p className="mt-2.5 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-soft">{FEATURES.booking.body}</p>
            </div>
          </div>
        </Stagger>
        <Reveal>
          <p className="mt-8 text-[15px] font-medium text-ink">
            It&apos;s not just candidates booking interviews. It&apos;s people who actually show up.
          </p>
        </Reveal>
      </section>

      {/* Pricing — one unified panel, hairline-divided: price rail left,
          what's-included right. Stacks to a single column on mobile. */}
      <section className={SECTION_DIVIDED}>
        <Reveal>
          <h2 className="t-title mb-12 max-w-[18ch]">Try it free.</h2>
        </Reveal>
        <Reveal>
          <div className="grid grid-cols-1 overflow-hidden rounded-[24px] border border-line-strong bg-card md:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-line p-8 md:border-b-0 md:border-r md:p-12">
              <div className="t-price">$0</div>
              <div className="mt-3 text-[15px] text-ink-soft">
                Due today. Then {PRICING.priceAnnual}/year (about {PRICING.priceMonthlyEquivalent}/mo) for all your
                locations. Nothing is charged during the trial.
              </div>

              {/* Cost anchor (Phase 2): structural, no dollar figure, since
                  no citable hospitality vacancy/turnover-cost stat cleared
                  this page's own verification bar (see docs/CLAIMS.md).
                  The comparison itself, manager time spent on back-and-forth
                  screening, is true on its face without needing a number. */}
              <p className="mt-3 text-[13px] leading-relaxed text-faint">
                Hiring isn&apos;t free while you wait, either. It&apos;s manager hours spent
                messaging applicants back and forth, many of whom never show.
              </p>

              {/* The trial IS the risk reversal now — no guarantee to run
                  alongside it, since you can't refund a charge that was
                  never made. Prominent, since this is the actual offer. */}
              <div className="mt-4 text-[18px] font-semibold text-ink">
                Your first {PRICING.freeCandidateCap} screened candidates are free.
              </div>

              {/* Structural, location-agnostic reinforcement — no location
                  count yet at this point in the funnel, so no personalized
                  per-location math here (that lives in the wizard, once the
                  operator has entered a location count — see step 4). */}
              <div className="mt-3 text-[13px] leading-relaxed text-faint">
                One flat rate: no per-location fees, no per-seat charges. Most platforms charge per
                location; AFRA doesn&apos;t.
              </div>

              <div className="mt-8">
                <CTA id="pricing" size="lg" full />
              </div>

              <div className="mt-5 rounded-xl border border-line bg-bg px-4 py-4">
                <p className="text-[14px] font-semibold text-ink">Free for {PRICING.freeCandidateCap} candidates or {PRICING.trialDaysBackstop} days</p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Whichever comes first. A card is required to start, but nothing is charged until
                  then, and you can cancel any time before that with nothing owed.
                </p>
              </div>
              <p className="mt-3 text-[13px] text-faint">
                After the trial, it&apos;s {PRICING.priceAnnual}/year (about {PRICING.priceMonthlyEquivalent}/mo),
                billed to the card on file each year until you cancel.
              </p>
            </div>

            <div className="flex flex-col justify-center p-8 md:p-12">
              <p className="t-label mb-5">What&apos;s included</p>
              <ul className="flex flex-col gap-3.5">
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
              <BookACallLink className="mt-8" />
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className={SECTION_DIVIDED}>
        <Stagger className="flex flex-col gap-3" step={90}>
          <h2 className="t-title mb-6 max-w-[14ch]">The short answers.</h2>
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </Stagger>
      </section>

      {/* Final CTA — full-bleed photo slideshow behind a periwinkle scrim */}
      <section className="relative overflow-hidden border-t border-line py-28 text-center md:py-40">
        <BackgroundSlideshow images={["/bg1.jpg", "/bg2.jpg", "/bg3.jpg", "/bg4.jpg"]} />
        <div className={`${SECTION} relative`}>
          <Stagger step={110}>
            <h2 className="t-display mx-auto max-w-[14ch]">Stop losing applicants.</h2>
            <div className="mt-10">
              <Magnetic>
                <CTA id="final" size="lg" />
              </Magnetic>
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
