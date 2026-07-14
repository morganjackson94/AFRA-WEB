"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  type LeadState,
  type OnboardingState,
  startOnboardingAction,
  submitQualificationLeadAction,
} from "./actions";
import { ArrowLeft, Calendar, Check, Instagram, Lock, Microsoft, Role, X } from "../../components/Icons";
import { LegalLinks } from "../../components/LegalLinks";
import {
  computeReachFlag,
  FOLLOWER_BANDS,
  HIRING_FREQUENCIES,
  isNonOperator,
  isOverCapacity,
  LOCATION_BUCKETS,
} from "../../lib/qualification";
import { Reveal } from "../../components/Reveal";
import { SectionLabel } from "../../components/SectionLabel";

// THRESHOLD MODE — the deliberate dramatic step-through before the dashboard.
// Same single periwinkle world as the rest of the app (#2D2D4A ground, warm
// cream text, candlelit amber accent), serif display + letter-spaced labels.
// Logic/copy unchanged from the original build.

const ROLES = ["Front of House", "Back of House", "Barista", "Line Cook"];
const CALENDARS: { id: string; label: string; Icon: typeof Calendar }[] = [
  { id: "google", label: "Google Calendar", Icon: Calendar },
  { id: "microsoft", label: "Microsoft 365", Icon: Microsoft },
  { id: "other", label: "Other calendar", Icon: Calendar },
];

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
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [pay, setPay] = useState("");
  const [calendarChoice, setCalendarChoice] = useState("");
  const [locationsBucket, setLocationsBucket] = useState("");
  const [followerBand, setFollowerBand] = useState("");
  const [hiringFrequency, setHiringFrequency] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [state, formAction, pending] = useActionState(startOnboardingAction, INITIAL);
  const [leadState, leadFormAction, leadPending] = useActionState(submitQualificationLeadAction, LEAD_INITIAL);

  const TOTAL = 4;
  const notAFit = isNonOperator(locationsBucket);
  const overCapacity = isOverCapacity(locationsBucket);
  const exitsToLead = notAFit || overCapacity;
  const isLowReach = computeReachFlag(followerBand);
  const canContinue =
    step === 1
      ? handle.trim() !== "" && email.trim().includes("@")
      : step === 2
        ? role !== ""
        : step === 3
          ? calendarChoice !== ""
          : exitsToLead ||
            (locationsBucket !== "" && followerBand !== "" && hiringFrequency !== "" && tosAccepted);

  return (
    // Flex column so the footer sits BELOW the content (no fixed-overlap bug).
    <form action={formAction} className="flex min-h-screen flex-col bg-threshold text-threshold-ink">
      {/* Hidden canonical values submitted on finish */}
      <input type="hidden" name="plan" value="founding" />
      <input type="hidden" name="instagramHandle" value={handle} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="pay" value={pay} />
      <input type="hidden" name="calendarChoice" value={calendarChoice} />
      <input type="hidden" name="locationsBucket" value={locationsBucket} />
      {/* Which Lead reason to record if the qualification step exits to the
          lead-capture form instead of checkout (see submitQualificationLeadAction). */}
      <input type="hidden" name="reason" value={overCapacity ? "over_capacity" : "0_locations"} />
      <input type="hidden" name="tosAccepted" value={tosAccepted ? "true" : "false"} />
      <input type="hidden" name="followerBand" value={followerBand} />
      <input type="hidden" name="hiringFrequency" value={hiringFrequency} />

      {/* Top bar: back · dots · close */}
      <div className="sticky top-0 z-10 flex items-center gap-3.5 bg-threshold px-5 py-4">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className={`grid size-9 place-items-center rounded-lg text-threshold-ink-soft hover:bg-threshold-soft hover:text-threshold-ink ${step === 1 ? "invisible" : ""}`}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5">
          {[1, 2, 3, 4].map((i) => (
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
      <div key={step} className="mx-auto w-full max-w-[460px] flex-1 px-6 pb-10 pt-12">
        {/* Step 1 — Instagram */}
        {step === 1 && (
          <div>
            <Reveal delay={0}>
              <SectionLabel index="01" tone="dark">Connect</SectionLabel>
            </Reveal>
            <Reveal hero delay={90}>
              <h2 className="t-title mt-6 mb-4 text-threshold-ink">Connect your Instagram</h2>
            </Reveal>
            <Reveal delay={200}>
              <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                This is where applicants message you to apply. Tell us the handle you use. We&apos;ll
                finish connecting it after setup.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="mb-6 grid aspect-[16/9] place-items-center rounded-2xl border border-threshold-line bg-threshold-soft">
                <div className="grid size-16 place-items-center rounded-2xl bg-[rgba(240,232,216,0.06)] text-threshold-ink">
                  <Instagram className="size-8" />
                </div>
              </div>
            </Reveal>
            <Reveal delay={400}>
              <div className="space-y-5">
                <Field label="Instagram handle">
                  <input
                    className={inputClass}
                    placeholder="@yourvenue"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    autoFocus
                  />
                </Field>
                <Field label="Email (for your account, receipts, and logging back in)">
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="you@venue.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
              </div>
            </Reveal>
            <Reveal delay={500}>
              <Lede>
                <Lock className="size-3.5" /> We&apos;ll never post without permission. Connection
                completes after setup.
              </Lede>
            </Reveal>
          </div>
        )}

        {/* Step 2 — Role + pay */}
        {step === 2 && (
          <div>
            <Reveal delay={0}>
              <SectionLabel index="02" tone="dark">Role</SectionLabel>
            </Reveal>
            <Reveal hero delay={90}>
              <h2 className="t-title mt-6 mb-4 text-threshold-ink">What are you hiring for?</h2>
            </Reveal>
            <Reveal delay={200}>
              <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                Pick the role. We already wrote the questions to ask. You can set the pay.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <SectionLabel tone="dark" className="mb-4">Popular roles</SectionLabel>
              <div className="space-y-2.5">
                {ROLES.map((r) => (
                  <OptionRow key={r} selected={role === r} onClick={() => setRole(r)} Icon={Role} label={r} />
                ))}
              </div>
            </Reveal>
            <Reveal delay={400}>
              <div className="mt-7">
                <Field label="Pay (optional)">
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

        {/* Step 3 — Calendar */}
        {step === 3 && (
          <div>
            <Reveal delay={0}>
              <SectionLabel index="03" tone="dark">Calendar</SectionLabel>
            </Reveal>
            <Reveal hero delay={90}>
              <h2 className="t-title mt-6 mb-4 text-threshold-ink">When can people interview?</h2>
            </Reveal>
            <Reveal delay={200}>
              <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                Choose your calendar. We only offer times you&apos;re free, and remind people before
                they come. We&apos;ll connect it after setup.
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
            <Reveal delay={400}>
              <Lede>
                <Lock className="size-3.5" /> We only read your availability. Connection completes after
                setup.
              </Lede>
            </Reveal>
          </div>
        )}

        {/* Step 4 — Qualification. A soft signal, never a gate: every answer
            except "0 locations" leads straight to checkout. Framed as
            selective (we ARE only taking 10), not as an access wall. */}
        {step === 4 && (
          <div>
            <Reveal delay={0}>
              <SectionLabel index="04" tone="dark">Qualify</SectionLabel>
            </Reveal>
            <Reveal hero delay={90}>
              <h2 className="t-title mt-6 mb-4 text-threshold-ink">A few quick questions</h2>
            </Reveal>
            <Reveal delay={200}>
              <p className="mb-8 text-[16px] leading-relaxed text-threshold-ink-soft">
                We&apos;re taking 10 founding operators. Three quick ones so we know who we&apos;re
                working with.
              </p>
            </Reveal>

            {exitsToLead ? (
              <Reveal delay={300}>
                {leadState.submitted ? (
                  <div className="rounded-2xl border border-threshold-line bg-threshold-soft p-6">
                    <p className="font-medium text-threshold-ink">Thanks for stopping by.</p>
                    <p className="mt-1.5 text-sm text-threshold-ink-soft">
                      We&apos;ll reach out if that changes.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-threshold-line bg-threshold-soft p-6">
                    <p className="text-[15px] leading-relaxed text-threshold-ink">
                      {overCapacity
                        ? "You're bigger than our founding cohort is built for."
                        : "AFRA is built for multi-location hospitality operators, so it may not be the right fit yet."}
                    </p>
                    <p className="mt-3 text-sm text-threshold-ink-soft">
                      {overCapacity
                        ? "Leave your email and we'll reach out personally."
                        : "Leave your email and we'll let you know if that changes."}
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
                  </div>
                )}
              </Reveal>
            ) : (
              <div className="space-y-7">
                <Reveal delay={300}>
                  <SectionLabel tone="dark" className="mb-3">
                    How many locations do you run?
                  </SectionLabel>
                  <PillGroup options={LOCATION_BUCKETS} selected={locationsBucket} onSelect={setLocationsBucket} />
                </Reveal>
                <Reveal delay={360}>
                  <SectionLabel tone="dark" className="mb-3">
                    {handle ? `Roughly how big is ${handle}'s Instagram following?` : "Roughly how big is your Instagram following?"}
                  </SectionLabel>
                  <PillGroup options={FOLLOWER_BANDS} selected={followerBand} onSelect={setFollowerBand} />
                  {isLowReach && (
                    <p className="mt-3 text-[13px] leading-relaxed text-threshold-ink-soft">
                      Heads up. With a smaller following you&apos;ll get the most out of this by also
                      sharing your hiring link (QR in-store, link in bio). We&apos;ll help you set that up.
                    </p>
                  )}
                </Reveal>
                <Reveal delay={420}>
                  <SectionLabel tone="dark" className="mb-3">
                    How often are you hiring hourly staff?
                  </SectionLabel>
                  <PillGroup options={HIRING_FREQUENCIES} selected={hiringFrequency} onSelect={setHiringFrequency} />
                </Reveal>
                <Reveal delay={480}>
                  <label className="flex items-start gap-3 text-[13.5px] leading-relaxed text-threshold-ink-soft">
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
          </div>
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
          {step < TOTAL ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep((s) => s + 1)}
              className="w-full rounded-full bg-threshold-ink px-6 py-3.5 text-base font-medium text-threshold transition duration-300 ease-editorial hover:opacity-90 disabled:opacity-40"
            >
              Continue
            </button>
          ) : exitsToLead ? (
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
          ) : (
            <button
              type="submit"
              disabled={!canContinue || pending}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-threshold-ink px-6 py-3.5 text-base font-medium text-threshold transition duration-300 ease-editorial hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Setting up your account…" : "Finish setup"}
            </button>
          )}
          {step === 1 && !canContinue && (
            <p className="mt-3 text-center text-[13.5px] text-threshold-ink-soft">Add your handle to continue</p>
          )}
          {step === TOTAL && !exitsToLead && (
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

// Compact single-select chips — the qualification step has 3 questions with
// several options each; full-size OptionRow cards for all of them would turn
// a "~30 second" step into a long scroll. Same inverted-fill selected state,
// smaller footprint.
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
