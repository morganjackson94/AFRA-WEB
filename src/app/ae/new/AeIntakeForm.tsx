"use client";

import { useActionState } from "react";
import { aeLogoutAction, createPrefillAction, type AeIntakeState } from "../actions";
import { CALENDAR_CHOICES, DISQUALIFIERS, ROLE_TITLES } from "../../../lib/onboardingOptions";
import { FOLLOWER_BANDS, HIRING_FREQUENCIES, LOCATION_BUCKETS, US_STATES } from "../../../lib/qualification";

const INITIAL: AeIntakeState = {};

const inputClass =
  "w-full rounded-xl border border-line-strong bg-card px-3.5 py-3 text-[16px] text-ink placeholder:text-ink-soft/60 focus:border-ink focus:outline-2 focus:outline-ink";

// One screen the AE fills in WHILE talking to the operator, same choices as
// the wizard. Submitting returns a 6-character code to read out:
// "Go to afravisibility.com/go and type <code>."
export function AeIntakeForm({ aeId }: { aeId: string }) {
  const [state, formAction, pending] = useActionState(createPrefillAction, INITIAL);

  if (state.ok) {
    const host = new URL(state.link).host.replace(/^www\./, "");
    const spaced = state.code.split("").join(" ");
    const subject = "Your AFRA setup link";
    const body = `Hi,\n\nHere's your AFRA setup link. Your details are already filled in:\n${state.link}\n\nOr go to ${host}/go and type ${state.code}. It works for 72 hours.\n\nTalk soon,\n${aeId[0].toUpperCase()}${aeId.slice(1)}, AFRA`;
    return (
      <main className="mx-auto max-w-[480px] px-6 py-12 text-ink">
        <p className="t-label text-ink-soft">Read this out</p>
        <p className="mt-3 rounded-2xl border border-line-strong bg-card px-4 py-6 text-center font-mono text-[44px] font-semibold tracking-[0.25em]">
          {state.code}
        </p>
        <p className="mt-5 text-[17px] leading-relaxed">
          &ldquo;Go to <b>{host}/go</b> and type <b>{spaced}</b>. I&apos;ll stay on with you.&rdquo;
        </p>
        <p className="mt-3 text-[14px] text-ink-soft">
          For {state.email}. Works until payment, or 72 hours. Then book the 10-minute setup call.
        </p>
        <div className="mt-6 space-y-3">
          <a
            href={`mailto:${state.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            className="block w-full rounded-full border border-line-strong px-6 py-3.5 text-center text-base font-medium hover:bg-card"
          >
            Email it to them (backup)
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="block w-full rounded-full bg-accent px-6 py-3.5 text-center text-base font-medium text-accent-ink hover:opacity-90"
          >
            Start another
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[480px] px-6 py-10 text-ink">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="t-title">New setup code</h1>
        <form action={aeLogoutAction}>
          <button type="submit" className="text-[13.5px] text-ink-soft underline underline-offset-4">
            Sign out ({aeId})
          </button>
        </form>
      </div>
      <p className="mb-8 text-[15px] leading-relaxed text-ink-soft">
        Fill this in while you talk. They&apos;ll check it and pay on their phone.
      </p>

      <form action={formAction} className="space-y-6">
        <Field label="Business name">
          <input name="businessName" required autoComplete="off" className={inputClass} placeholder="Juniper & Salt" />
        </Field>

        <Field label="Their email">
          <input type="email" name="email" required autoComplete="off" className={inputClass} placeholder="owner@venue.com" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Locations">
            <Select name="locationsBucket" options={LOCATION_BUCKETS} />
          </Field>
          <Field label="Main state">
            <Select name="primaryState" options={US_STATES} defaultValue="TX" />
          </Field>
        </div>
        <Check name="hasNycLocation" label="Any location in New York City?" />

        <Group legend="Roles they're hiring">
          {ROLE_TITLES.map((r) => (
            <Check key={r} name="roles" value={r} label={r} />
          ))}
          <input name="otherRole" className={`${inputClass} mt-2`} placeholder="Other role (optional)" />
        </Group>

        <Field label="Pay (optional)">
          <input name="pay" className={inputClass} placeholder="$16–18 / hr" />
        </Field>

        <Group legend="Deal-breakers">
          {DISQUALIFIERS.map((d) => (
            <Check key={d.value} name="disqualifiers" value={d.value} label={d.label} />
          ))}
        </Group>

        <Field label="Instagram handle">
          <input name="handle" required autoComplete="off" className={inputClass} placeholder="@venue" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Followers">
            <Select name="followerBand" options={FOLLOWER_BANDS} />
          </Field>
          <Field label="How often they hire">
            <Select name="hiringFrequency" options={HIRING_FREQUENCIES} />
          </Field>
        </div>

        <Field label="Calendar">
          <Select name="calendarChoice" options={CALENDAR_CHOICES.map((c) => ({ value: c.id, label: c.label }))} />
        </Field>
        <Field label="Booking link (optional, can wait for the setup call)">
          <input type="url" name="bookingLinkUrl" className={inputClass} placeholder="https://calendly.com/…" />
        </Field>

        {state.error && (
          <p role="alert" className="rounded-xl border border-rose/40 bg-cream px-4 py-3 text-sm text-rose">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="sticky bottom-4 w-full rounded-full bg-accent px-6 py-4 text-base font-medium text-accent-ink shadow-lg transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Making the code…" : "Get the code"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="t-label mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="t-label mb-2 block">{legend}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  );
}

function Check({ name, value, label }: { name: string; value?: string; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15.5px]">
      <input type="checkbox" name={name} value={value ?? "on"} className="size-5 flex-none accent-accent" />
      {label}
    </label>
  );
}

function Select({
  name,
  options,
  defaultValue = "",
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <select name={name} required defaultValue={defaultValue} className={inputClass}>
      <option value="" disabled>
        Pick one
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
