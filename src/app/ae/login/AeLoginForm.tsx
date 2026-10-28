"use client";

import { useActionState } from "react";
import { aeLoginAction, type AeLoginState } from "../actions";

const INITIAL: AeLoginState = {};

export function AeLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(aeLoginAction, INITIAL);
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6 py-16 text-ink">
      <h1 className="t-title mb-2">AE sign in</h1>
      <p className="mb-8 text-[15px] leading-relaxed text-ink-soft">For AFRA reps. Use your own passphrase.</p>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="t-label mb-2 block">Passphrase</span>
          <input
            type="password"
            name="passphrase"
            autoComplete="current-password"
            required
            autoFocus
            className="w-full rounded-xl border border-line-strong bg-card px-3.5 py-3.5 text-[16px] text-ink focus:border-ink focus:outline-2 focus:outline-ink"
          />
        </label>
        {state.error && (
          <p role="alert" className="text-sm text-rose">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-accent px-6 py-3.5 text-base font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
