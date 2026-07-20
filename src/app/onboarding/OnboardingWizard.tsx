"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  type LeadState,
  loadOnboardingDraftAction,
  type OnboardingState,
  saveOnboardingDraftAction,
  startOnboardingAction,
  submitQualificationLeadAction,
} from "./actions";
import { ArrowLeft, Calendar, Check, ChevronDown, Instagram, Lock, Microsoft, X } from "../../components/Icons";
import { LegalLinks } from "../../components/LegalLinks";
import { matchedRestrictedJurisdictions } from "../../lib/jurisdiction";
import {
  computeReachFlag,
  FOLLOWER_BANDS,
  HIRING_FREQUENCIES,
  LOCATION_BUCKETS,
  US_STATES,
} from "../../lib/qualification";
import { Reveal } from "../../components/Reveal";
import { trackMetaEvent } from "../../lib/metaPixel";
import { getQuestionSetForRole } from "../../lib/screeningQuestions";
import { validateOtherRoleText } from "../../lib/textSanitize";
import { SectionLabel } from "../../components/SectionLabel";

// THRESHOLD MODE — the deliberate dramatic step-through before the dashboard.
// Same single periwinkle world as the rest of the app (#2D2D4A ground, warm
// cream text, candlelit amber accent), serif display + letter-spaced labels.
//
// 7-step redesign: every question pulls double duty — qualify the buyer AND
// configure their account. Cheap questions first, the highest-friction
// free-text question (step 5b) immediately before price is shown, price
// visible before that question. Progressive save (OnboardingDraft, keyed by
// email) mirrors the accumulated answers after every step so an abandoned
// session is recoverable — it is NOT the source of truth for the live
// submission, which still flows through this component's own React state at
// the final step, same as the old 4-step version always did.

const ROLES = ["Front of House", "Back of House", "Barista", "Line Cook"];
const OTHER_ROLE = "__other__";
const ROLE_OPTIONS = [...ROLES.map((r) => ({ value: r, label: r })), { value: OTHER_ROLE, label: "Other" }];

const DISQUALIFIERS = [
  { value: "no_weekends", label: "No weekend availability" },
  { value: "no_evenings", label: "No evening availability" },
  { value: "under_6mo_experience", label: "Under 6 months experience" },
  { value: "no_transportation", label: "No reliable transportation" },
  { value: "cant_open", label: "Can't work opening shifts" },
  { value: "cant_close", label: "Can't work closing shifts" },
  { value: "no_food_handler_cert", label: "No food handler cert" },
  { value: "wont_commit_3mo", label: "Won't commit to 3+ months" },
] as const;

const CALENDARS: { id: string; label: string; Icon: typeof Calendar }[] = [
  { id: "google", label: "Google Calendar", Icon: Calendar },
  { id: "microsoft", label: "Microsoft 365", Icon: Microsoft },
  { id: "other", label: "Other calendar", Icon: Calendar },
];
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const TOTAL = 7;
const INITIAL: OnboardingState = {};
const LEAD_INITIAL: LeadState = {};

const inputClass =
  "w-full rounded-xl border border-threshold-line bg-threshold-soft px-3.5 py-3.5 text-[16px] text-threshold-ink placeholder:text-threshold-ink-soft/60 focus:border-threshold-ink focus:outline-2 focus:outline-threshold-ink";

export function OnboardingWizard({
  termsContent,
  privacyContent,
}: {
  termsContent: string;
  privacyContent: string;
}) {
  const [step, setStep] = useState(1);
  const [savingDraft, setSavingDraft] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [resumedBanner, setResumedBanner] = useState(false);

  // Step 1
  const [email, setEmail] = useState("");
  const [locationsBucket, setLocationsBucket] = useState("");
  // Step 2
  const [primaryState, setPrimaryState] = useState("");
  // Tri-state, not boolean: null = "hasn't answered yet". Only matters when
  // NY is selected (NYC is the one place state-level resolution isn't
  // enough) — forcing an explicit answer closes the loophole where an
  // unanswered follow-up would silently default to "not NYC".
  const [hasNycLocation, setHasNycLocation] = useState<boolean | null>(null);
  const [restricted, setRestricted] = useState(false);
  // Step 3
  const [roles, setRoles] = useState<string[]>([]);
  const [otherRoleText, setOtherRoleText] = useState("");
  const [pay, setPay] = useState("");
  // Step 5
  const [disqualifiers, setDisqualifiers] = useState<string[]>([]);
  const [badHireText, setBadHireText] = useState("");
  // Step 6
  const [handle, setHandle] = useState("");
  const [facebookHandle, setFacebookHandle] = useState("");
  const [followerBand, setFollowerBand] = useState("");
  const [hiringFrequency, setHiringFrequency] = useState("");
  // Step 7
  const [calendarChoice, setCalendarChoice] = useState("");
  const [bookingLinkUrl, setBookingLinkUrl] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);

  const [state, formAction, pending] = useActionState(startOnboardingAction, INITIAL);
  const [leadState, leadFormAction, leadPending] = useActionState(submitQualificationLeadAction, LEAD_INITIAL);

  const nycNeedsAnswer = primaryState === "NY" && hasNycLocation === null;
  const isLowReach = computeReachFlag(followerBand);
  const otherValidation = roles.includes(OTHER_ROLE) ? validateOtherRoleText(otherRoleText) : null;
  const finalRoleTitles = [
    ...roles.filter((r) => r !== OTHER_ROLE),
    ...(otherValidation && otherValidation.ok ? [otherValidation.value] : []),
  ];

  function buildAnswers() {
    return {
      locationsBucket,
      primaryState,
      hasNycLocation,
      roles,
      otherRoleText,
      pay,
      disqualifiers,
      badHireText,
      handle,
      facebookHandle,
      followerBand,
      hiringFrequency,
      calendarChoice,
      bookingLinkUrl,
      tosAccepted,
    };
  }

  function applyDraftAnswers(a: Record<string, unknown>) {
    if (typeof a.locationsBucket === "string") setLocationsBucket(a.locationsBucket);
    if (typeof a.primaryState === "string") setPrimaryState(a.primaryState);
    if (typeof a.hasNycLocation === "boolean") setHasNycLocation(a.hasNycLocation);
    if (Array.isArray(a.roles)) setRoles(a.roles as string[]);
    if (typeof a.otherRoleText === "string") setOtherRoleText(a.otherRoleText);
    if (typeof a.pay === "string") setPay(a.pay);
    if (Array.isArray(a.disqualifiers)) setDisqualifiers(a.disqualifiers as string[]);
    if (typeof a.badHireText === "string") setBadHireText(a.badHireText);
    if (typeof a.handle === "string") setHandle(a.handle);
    if (typeof a.facebookHandle === "string") setFacebookHandle(a.facebookHandle);
    if (typeof a.followerBand === "string") setFollowerBand(a.followerBand);
    if (typeof a.hiringFrequency === "string") setHiringFrequency(a.hiringFrequency);
    if (typeof a.calendarChoice === "string") setCalendarChoice(a.calendarChoice);
    if (typeof a.bookingLinkUrl === "string") setBookingLinkUrl(a.bookingLinkUrl);
    if (typeof a.tosAccepted === "boolean") setTosAccepted(a.tosAccepted);
  }

  // Resume-on-mount: fires once, on the step-1 email field losing focus.
  // Pre-purchase, low-stakes data — no auth needed, same trust level as Lead
  // capture. Re-entering the same email is the whole "login."
  async function checkForResume() {
    if (resumeChecked || !email.trim().includes("@")) return;
    setResumeChecked(true);
    const draft = await loadOnboardingDraftAction(email.trim());
    if (draft) {
      applyDraftAnswers(draft.answers);
      setStep(draft.step);
      setResumedBanner(true);
    }
  }

  // Persist after every step (resilience mirror, not the source of truth for
  // the live submission — see the file header comment). Step 2's save also
  // re-runs the jurisdiction hard-gate server-side, earlier than the old
  // flow did (that already ran pre-payment, just at the last step) — this
  // means someone in a restricted state finds out before answering 5 more
  // questions, not just before paying.
  async function goNext() {
    setSavingDraft(true);
    const result = await saveOnboardingDraftAction(email.trim(), step, buildAnswers());
    setSavingDraft(false);
    if (step === 2 && result.restricted) {
      setRestricted(true);
      return;
    }
    setStep((s) => s + 1);
  }

  const canContinue =
    step === 1
      ? email.trim().includes("@") && locationsBucket !== ""
      : step === 2
        ? primaryState !== "" && !nycNeedsAnswer
        : step === 3
          ? finalRoleTitles.length > 0
          : step === 4
            ? true
            : step === 5
              ? true
              : step === 6
                ? handle.trim() !== ""
                : calendarChoice !== "" && tosAccepted;

  return (
    // Flex column so the footer sits BELOW the content (no fixed-overlap bug).
    <form action={formAction} className="flex min-h-screen flex-col bg-threshold text-threshold-ink">
      {/* Hidden canonical values submitted on finish */}
      <input type="hidden" name="plan" value="founding" />
      <input type="hidden" name="instagramHandle" value={handle} />
      <input type="hidden" name="facebookHandle" value={facebookHandle} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="roles" value={JSON.stringify(finalRoleTitles)} />
      <input type="hidden" name="pay" value={pay} />
      <input type="hidden" name="calendarChoice" value={calendarChoice} />
      <input type="hidden" name="bookingLinkUrl" value={bookingLinkUrl} />
      <input type="hidden" name="locationsBucket" value={locationsBucket} />
      <input type="hidden" name="primaryState" value={primaryState} />
      <input type="hidden" name="hasNycLocation" value={hasNycLocation ? "true" : "false"} />
      <input type="hidden" name="disqualifiers" value={JSON.stringify(disqualifiers)} />
      <input type="hidden" name="badHireText" value={badHireText} />
      {/* Restricted always exits via the step-2 panel now — the other two
          legacy Lead reasons (0 locations / over capacity) no longer exist
          in this flow (see qualification.ts). */}
      <input type="hidden" name="reason" value={restricted ? "restricted_jurisdiction" : ""} />
      <input
        type="hidden"
        name="detail"
        value={matchedRestrictedJurisdictions(primaryState ? [primaryState] : [], hasNycLocation === true)
          .map((j) => `${j.state} (${j.law})`)
          .join(", ")}
      />
      <input type="hidden" name="tosAccepted" value={tosAccepted ? "true" : "false"} />
      <input type="hidden" name="followerBand" value={followerBand} />
      <input type="hidden" name="hiringFrequency" value={hiringFrequency} />

      {/* Top bar: back · dots · close */}
      <div className="sticky top-0 z-10 flex items-center gap-3.5 bg-threshold px-5 py-4">
        <button
          type="button"
          onClick={() => {
            setRestricted(false);
            setStep((s) => Math.max(1, s - 1));
          }}
          className={`grid size-9 place-items-center rounded-lg text-threshold-ink-soft hover:bg-threshold-soft hover:text-threshold-ink ${step === 1 ? "invisible" : ""}`}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5">
          {Array.from({ length: TOTAL }, (_, i) => i + 1).map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ease-editorial ${
                i === step ? "w-6 bg-threshold-ink" : i < step ? "w-1.5 bg-threshold-ink/40" : "w-1.5 bg-threshold-line"
              }`}
            />
          ))}
        </div>
        <Link
          href="/"
          className="grid size-9 place-items-center rounded-lg text-threshold-ink-soft hover:bg-threshold-soft hover:text-threshold-ink"
          aria-label="Close"
        >
          <X className="size-5" />
        </Link>
      </div>

      {/* Content — flex-1 pushes the footer to the bottom; tall steps just scroll.
          key={step} remounts on step change so the staggered reveal re-runs. */}
      <div key={`${step}-${restricted}`} className="mx-auto w-full max-w-[460px] flex-1 px-6 pb-10 pt-12">
        {/* Step 2's restricted exit overrides everything else at that step. */}
        {step === 2 && restricted ? (
          <div>
            <Reveal delay={0}>
              <SectionLabel index="02" tone="dark">Market</SectionLabel>
            </Reveal>
            <Reveal hero delay={90}>
              <h2 className="t-title mt-6 mb-4 text-threshold-ink">Not available in your area yet</h2>
            </Reveal>
            <Reveal delay={200}>
              <div className="rounded-2xl border border-threshold-line bg-threshold-soft p-6">
                {leadState.submitted ? (
                  <>
                    <p className="font-medium text-threshold-ink">Thanks for stopping by.</p>
                    <p className="mt-1.5 text-sm text-threshold-ink-soft">We&apos;ll reach out if that changes.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[15px] leading-relaxed text-threshold-ink">
                      New York City, Illinois, and Colorado have specific legal requirements for automated hiring
                      tools that we don&apos;t support yet. We can&apos;t offer AFRA for locations there right now.
                    </p>
                    <p className="mt-3 text-sm text-threshold-ink-soft">
                      Leave your info and we&apos;ll reach out when that changes.
                    </p>
                    <div className="mt-4">
                      <Field label="Email">
                        <input
                          type="email"
                          className={inputClass}
                          placeholder="you@venue.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </Field>
                    </div>
                    {leadState.error && <p className="mt-2 text-sm text-red-300">{leadState.error}</p>}
                  </>
                )}
              </div>
            </Reveal>
          </div>
        ) : (
          <>
            {/* Step 1 — Locations + email */}
            {step === 1 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="01" tone="dark">Start</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">How many locations do you run?</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    We&apos;ll tailor your account to your size. Flat $1,990/year covers every location either way.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <Field label="Email (for your account, receipts, and logging back in)">
                    <input
                      type="email"
                      className={inputClass}
                      placeholder="you@venue.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => void checkForResume()}
                      autoFocus
                      required
                    />
                  </Field>
                  {resumedBanner && (
                    <p className="mt-2 text-[13px] text-threshold-ink-soft">
                      Welcome back — we restored your progress from before.
                    </p>
                  )}
                </Reveal>
                <Reveal delay={380}>
                  <div className="mt-6">
                    <SectionLabel tone="dark" className="mb-3">Locations</SectionLabel>
                    <PillGroup options={LOCATION_BUCKETS} selected={locationsBucket} onSelect={setLocationsBucket} />
                  </div>
                </Reveal>
                {(locationsBucket === "1-2" || locationsBucket === "16+") && (
                  <Reveal delay={420}>
                    <p className="mt-3 text-[13px] leading-relaxed text-threshold-ink-soft">
                      AFRA is built for multi-location operators — you&apos;re welcome to continue.
                    </p>
                  </Reveal>
                )}
              </div>
            )}

            {/* Step 2 — Primary market (geofence gate) */}
            {step === 2 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="02" tone="dark">Market</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">Where do you operate?</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    Pick the state most of your locations are in.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <PillGroup options={US_STATES} selected={primaryState} onSelect={setPrimaryState} />
                  {primaryState === "NY" && (
                    <div className="mt-4">
                      <SectionLabel tone="dark" className="mb-3">Any locations in New York City itself?</SectionLabel>
                      <PillGroup
                        options={YES_NO}
                        selected={hasNycLocation === null ? "" : hasNycLocation ? "yes" : "no"}
                        onSelect={(v) => setHasNycLocation(v === "yes")}
                      />
                    </div>
                  )}
                </Reveal>
              </div>
            )}

            {/* Step 3 — Roles */}
            {step === 3 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="03" tone="dark">Roles</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">Which roles are you hiring for?</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    Pick at least one. We already wrote the screening questions for each.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <MultiPillGroup
                    options={ROLE_OPTIONS}
                    selected={roles}
                    onToggle={(v) =>
                      setRoles((prev) => (prev.includes(v) ? prev.filter((r) => r !== v) : [...prev, v]))
                    }
                  />
                  {roles.includes(OTHER_ROLE) && (
                    <div className="mt-4">
                      <Field label={`Role title (max ${24} characters)`}>
                        <input
                          className={inputClass}
                          placeholder="e.g. Expo"
                          value={otherRoleText}
                          onChange={(e) => setOtherRoleText(e.target.value)}
                          maxLength={24}
                        />
                      </Field>
                      {otherValidation && !otherValidation.ok && otherRoleText.trim() !== "" && (
                        <p className="mt-1.5 text-[13px] text-red-300">{otherValidation.error}</p>
                      )}
                    </div>
                  )}
                </Reveal>
                <Reveal delay={360}>
                  <div className="mt-4">
                    <QuestionsPreview roleTitle={finalRoleTitles[0] ?? ""} />
                  </div>
                </Reveal>
                <Reveal delay={420}>
                  <div className="mt-7">
                    <Field label="Typical pay, all roles (optional)">
                      <input
                        className={inputClass}
                        placeholder="$16-18 / hr"
                        value={pay}
                        onChange={(e) => setPay(e.target.value)}
                      />
                    </Field>
                  </div>
                </Reveal>
              </div>
            )}

            {/* Step 4 — Price checkpoint, before the highest-friction question */}
            {step === 4 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="04" tone="dark">Price</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">$1,990/year, every location included</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    One flat rate, paid annually. A few more questions and you&apos;re done.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <ul className="space-y-3">
                    {[
                      "Flat $1,990/year — every location covered",
                      "Paid from day one, no trial",
                      "30-day money-back guarantee",
                      "Founding rate locked at renewal",
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-[15px] text-threshold-ink-soft">
                        <Check className="mt-0.5 size-[16px] flex-none text-accent" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </div>
            )}

            {/* Step 5 — Disqualifiers (the screener input) */}
            {step === 5 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="05" tone="dark">Fit</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">What makes someone the wrong hire?</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    We&apos;ll screen these out automatically. Pick any that apply.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <MultiPillGroup
                    options={DISQUALIFIERS}
                    selected={disqualifiers}
                    onToggle={(v) =>
                      setDisqualifiers((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]))
                    }
                  />
                </Reveal>
                <Reveal delay={380}>
                  <div className="mt-7">
                    <Field label="Describe someone you hired recently and regretted. What did you miss? (optional)">
                      <textarea
                        className={`${inputClass} min-h-[110px] resize-none`}
                        placeholder="What would have told you sooner?"
                        value={badHireText}
                        onChange={(e) => setBadHireText(e.target.value)}
                      />
                    </Field>
                  </div>
                </Reveal>
              </div>
            )}

            {/* Step 6 — Social handle + audience */}
            {step === 6 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="06" tone="dark">Audience</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">Where will you post your hiring content?</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    This is where applicants message you to apply. We&apos;ll finish connecting it after setup.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <div className="mb-6 grid aspect-[16/9] place-items-center rounded-2xl border border-threshold-line bg-threshold-soft">
                    <div className="grid size-16 place-items-center rounded-2xl bg-[rgba(240,232,216,0.06)] text-threshold-ink">
                      <Instagram className="size-8" />
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={360}>
                  <div className="space-y-5">
                    <Field label="Instagram handle">
                      <input
                        className={inputClass}
                        placeholder="@yourvenue"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                      />
                    </Field>
                    <Field label="Facebook handle (optional)">
                      <input
                        className={inputClass}
                        placeholder="facebook.com/yourvenue"
                        value={facebookHandle}
                        onChange={(e) => setFacebookHandle(e.target.value)}
                      />
                    </Field>
                  </div>
                  {handle.trim() === "" && facebookHandle.trim() === "" && (
                    <p className="mt-3 text-[13px] leading-relaxed text-threshold-ink-soft">
                      We recommend adding at least one so we know where to post your hiring content.
                    </p>
                  )}
                </Reveal>
                <Reveal delay={420}>
                  <div className="mt-7">
                    <SectionLabel tone="dark" className="mb-3">
                      {handle ? `Roughly how big is ${handle}'s following?` : "Roughly how big is your following?"}
                    </SectionLabel>
                    <PillGroup options={FOLLOWER_BANDS} selected={followerBand} onSelect={setFollowerBand} />
                    {isLowReach && (
                      <p className="mt-3 text-[13px] leading-relaxed text-threshold-ink-soft">
                        Heads up. With a smaller following you&apos;ll get the most out of this by also sharing
                        your hiring link (QR in-store, link in bio). We&apos;ll help you set that up.
                      </p>
                    )}
                  </div>
                </Reveal>
                <Reveal delay={480}>
                  <div className="mt-7">
                    <SectionLabel tone="dark" className="mb-3">How often are you hiring hourly staff?</SectionLabel>
                    <PillGroup options={HIRING_FREQUENCIES} selected={hiringFrequency} onSelect={setHiringFrequency} />
                  </div>
                </Reveal>
              </div>
            )}

            {/* Step 7 — Checkout: calendar + booking link + ToS + pay */}
            {step === 7 && (
              <div>
                <Reveal delay={0}>
                  <SectionLabel index="07" tone="dark">Checkout</SectionLabel>
                </Reveal>
                <Reveal hero delay={90}>
                  <h2 className="t-title mt-6 mb-4 text-threshold-ink">When can people interview?</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                    Choose your calendar. We only offer times you&apos;re free, and remind people before they
                    come. We&apos;ll connect it after setup.
                  </p>
                </Reveal>
                <Reveal delay={300}>
                  <div className="space-y-2.5">
                    {CALENDARS.map(({ id, label, Icon }) => (
                      <OptionRow
                        key={id}
                        selected={calendarChoice === id}
                        onClick={() => setCalendarChoice(id)}
                        Icon={Icon}
                        label={label}
                      />
                    ))}
                  </div>
                </Reveal>
                <Reveal delay={360}>
                  <div className="mt-7">
                    <Field label="Booking link (optional)">
                      <input
                        type="url"
                        className={inputClass}
                        placeholder="Your Google Calendar or Calendly link"
                        value={bookingLinkUrl}
                        onChange={(e) => setBookingLinkUrl(e.target.value)}
                      />
                    </Field>
                    <p className="mt-2 text-[13px] leading-relaxed text-threshold-ink-soft">
                      Don&apos;t have one yet? No problem, we&apos;ll set it up together on your setup call.
                    </p>
                  </div>
                </Reveal>
                <Reveal delay={420}>
                  <Lede>
                    <Lock className="size-3.5" /> We only read your availability. Connection completes after setup.
                  </Lede>
                </Reveal>
                <Reveal delay={460}>
                  <label className="mt-6 flex items-start gap-3 text-[13.5px] leading-relaxed text-threshold-ink-soft">
                    <input
                      type="checkbox"
                      checked={tosAccepted}
                      onChange={(e) => setTosAccepted(e.target.checked)}
                      className="mt-0.5 size-4 flex-none rounded border-threshold-line bg-threshold-soft accent-accent"
                    />
                    I agree to the{" "}
                    <LegalLinks termsContent={termsContent} privacyContent={privacyContent} variant="consent" />.
                  </label>
                </Reveal>
              </div>
            )}
          </>
        )}

        {state.error && (
          <p className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">
            {state.error}
          </p>
        )}
      </div>

      {/* Footer — static (in flow), bordered. No fixed positioning => no overlap. */}
      <div className="sticky bottom-0 border-t border-threshold-line bg-threshold px-6 py-6">
        <div className="mx-auto max-w-[460px]">
          {restricted ? (
            leadState.submitted ? (
              <Link
                href="/"
                className="flex w-full items-center justify-center rounded-full border border-threshold-line px-6 py-3.5 text-base font-medium text-threshold-ink transition duration-300 ease-editorial hover:bg-threshold-soft"
              >
                Back to the site
              </Link>
            ) : (
              <button
                type="submit"
                formAction={leadFormAction}
                disabled={!email.trim().includes("@") || leadPending}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-threshold-ink px-6 py-3.5 text-base font-medium text-threshold transition duration-300 ease-editorial hover:opacity-90 disabled:opacity-40"
              >
                {leadPending ? "Sending…" : "Keep me posted"}
              </button>
            )
          ) : step < TOTAL ? (
            <button
              type="button"
              disabled={!canContinue || savingDraft}
              onClick={() => void goNext()}
              className="w-full rounded-full bg-threshold-ink px-6 py-3.5 text-base font-medium text-threshold transition duration-300 ease-editorial hover:opacity-90 disabled:opacity-40"
            >
              {savingDraft ? "Saving…" : "Continue"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canContinue || pending}
              // Diagnostic signal only, fired at click intent — not gated on
              // provision()/checkout actually succeeding, and never awaited,
              // so it can't delay the real submit/redirect that follows.
              onClick={() => trackMetaEvent("InitiateCheckout")}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-threshold-ink px-6 py-3.5 text-base font-medium text-threshold transition duration-300 ease-editorial hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Setting up your account…" : "Finish setup"}
            </button>
          )}
          {step === 1 && !canContinue && (
            <p className="mt-3 text-center text-[13.5px] text-threshold-ink-soft">
              Add your email and location count to continue
            </p>
          )}
          {step === TOTAL && !restricted && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[13.5px] text-threshold-ink-soft">
              <Check className="size-3.5 text-accent" /> Paid from day one · 30-day money-back guarantee
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="t-label text-threshold-ink-soft mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-threshold-ink-soft">
      {children}
    </div>
  );
}

// Loud, unmistakable selected state: selecting INVERTS the card to a filled light
// surface with dark text + a filled radio. Updates instantly on click (controlled
// state), deselecting the others.
function OptionRow({
  selected,
  onClick,
  Icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  Icon: typeof Calendar;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-4 text-left transition duration-300 ease-editorial ${
        selected
          ? "border-threshold-ink bg-threshold-ink text-threshold shadow-[0_10px_30px_-12px_rgba(255,255,255,0.25)]"
          : "border-threshold-line text-threshold-ink hover:border-threshold-ink-soft"
      }`}
    >
      <span
        className={`grid size-9 flex-none place-items-center rounded-lg ${
          selected ? "bg-threshold/10 text-threshold" : "bg-[rgba(240,232,216,0.06)] text-threshold-ink"
        }`}
      >
        <Icon className="size-[18px]" />
      </span>
      <b className="flex-1 text-[15.5px] font-medium">{label}</b>
      {/* Filled radio when selected (not an empty ring). */}
      <span
        className={`grid size-5 flex-none place-items-center rounded-full border-[1.6px] ${
          selected ? "border-threshold bg-threshold" : "border-threshold-line"
        }`}
      >
        {selected && <span className="size-[8px] rounded-full bg-threshold-ink" />}
      </span>
    </button>
  );
}

// Compact single-select chips — several steps have one question with many
// options; full-size OptionRow cards for all of them would turn a "quick"
// step into a long scroll. Same inverted-fill selected state, smaller footprint.
function PillGroup({
  options,
  selected,
  onSelect,
}: {
  options: readonly { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          aria-pressed={selected === o.value}
          className={`rounded-full border px-4 py-2 text-[14px] font-medium transition duration-200 ease-editorial ${
            selected === o.value
              ? "border-threshold-ink bg-threshold-ink text-threshold"
              : "border-threshold-line text-threshold-ink-soft hover:border-threshold-ink-soft hover:text-threshold-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Read-only preview backing "We already wrote the questions to ask" — collapsed
// by default so the step doesn't grow. roleTitle="" still resolves
// (getQuestionSetForRole falls back to the generic v1 set), so this works
// before a role is picked too.
function QuestionsPreview({ roleTitle }: { roleTitle: string }) {
  const [open, setOpen] = useState(false);
  const set = getQuestionSetForRole(roleTitle);

  return (
    <div className="rounded-xl border border-threshold-line bg-threshold-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[14px] font-medium text-threshold-ink"
      >
        See the questions we&apos;ll ask
        <ChevronDown className={`size-4 flex-none text-threshold-ink-soft transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-threshold-line px-4 py-4">
          {set.questions.map((q) => (
            <div key={q.key}>
              <p className="text-[14px] font-medium text-threshold-ink">{q.question}</p>
              <ul className="mt-1.5 space-y-0.5">
                {q.options.map((o) => (
                  <li key={o.letter} className="text-[13px] text-threshold-ink-soft">
                    {o.letter}. {o.label}
                    {q.disqualifyingLetters.includes(o.letter) && (
                      <span className="ml-1.5 text-[11px] uppercase tracking-[0.08em] text-threshold-ink-soft/70">
                        screens out
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Same visual language as PillGroup, but toggles membership in an array
// instead of single-select — used wherever more than one answer is valid
// (states, roles, disqualifiers).
function MultiPillGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onToggle(o.value)}
          aria-pressed={selected.includes(o.value)}
          className={`rounded-full border px-4 py-2 text-[14px] font-medium transition duration-200 ease-editorial ${
            selected.includes(o.value)
              ? "border-threshold-ink bg-threshold-ink text-threshold"
              : "border-threshold-line text-threshold-ink-soft hover:border-threshold-ink-soft hover:text-threshold-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
