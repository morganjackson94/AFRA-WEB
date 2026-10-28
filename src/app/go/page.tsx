import { goToCodeAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  invalid: "That code didn't work. It may have expired. Ask your AFRA rep for a new one.",
  locked: "Too many tries. Wait 10 minutes, or ask your AFRA rep to read the code again.",
};

// Where an operator types the 6-character code an AFRA rep reads out on a
// sales call (see src/lib/aePrefill.ts). Deliberately tiny: one field, big type.
export default async function GoPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const error = e ? (ERROR_COPY[e] ?? ERROR_COPY.invalid) : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6 py-16 text-ink">
      <h1 className="t-title mb-2">Enter your code</h1>
      <p className="mb-8 text-[15px] leading-relaxed text-ink-soft">
        Type the 6-character code your AFRA rep gave you. Your details are already filled in.
      </p>
      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-rose/40 bg-cream px-4 py-3 text-sm text-rose">
          {error}
        </p>
      )}
      <form action={goToCodeAction} className="space-y-4">
        <label className="block">
          <span className="t-label mb-2 block">Code</span>
          <input
            name="code"
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
            autoFocus
            placeholder="K7P2QD"
            className="w-full rounded-xl border border-line-strong bg-card px-4 py-4 text-center font-mono text-[28px] uppercase tracking-[0.3em] text-ink placeholder:text-ink-soft/40 focus:border-ink focus:outline-2 focus:outline-ink"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-6 py-3.5 text-base font-medium text-accent-ink transition hover:opacity-90"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
