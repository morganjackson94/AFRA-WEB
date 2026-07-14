"use client";

import { useActionState } from "react";
import { type LoginState, requestMagicLinkAction } from "./actions";
import { Reveal } from "../../components/Reveal";

const INITIAL: LoginState = {};

const inputClass =
  "w-full rounded-xl border border-line-strong bg-card px-3.5 py-3.5 text-[16px] text-ink placeholder:text-ink-soft/60 focus:border-ink focus:outline-2 focus:outline-ink";

export function LoginForm({ linkError }: { linkError?: string }) {
  const [state, formAction, pending] = useActionState(requestMagicLinkAction, INITIAL);

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6 py-16 text-ink">
      <Reveal>
        <h1 className="t-title mb-2">Log in</h1>
        <p className="mb-8 text-[15px] leading-relaxed text-ink-soft">
          Enter the email you signed up with. We&apos;ll send a link to log back in, no password needed.
        </p>
        {linkError && !state.sent && (
          <p className="mb-6 rounded-xl border border-rose/40 bg-cream px-4 py-3 text-sm text-rose">
            {linkError}
          </p>
        )}
      </Reveal>

      {state.sent ? (
        <Reveal>
          <div className="rounded-2xl border border-line bg-card p-6">
            <p className="font-medium text-ink">Check your email.</p>
            <p className="mt-1.5 text-sm text-ink-soft">
              If that address has an account, a login link just went out. It works once and expires in 15
              minutes.
            </p>
          </div>
        </Reveal>
      ) : (
        <Reveal>
          <form action={formAction} className="space-y-4">
            <label className="block">
              <span className="t-label mb-2 block">Email</span>
              <input type="email" name="email" className={inputClass} placeholder="you@venue.com" required autoFocus />
            </label>
            {state.error && <p className="text-sm text-rose">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-full bg-accent px-6 py-3.5 text-base font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send login link"}
            </button>
          </form>
        </Reveal>
      )}
    </main>
  );
}
