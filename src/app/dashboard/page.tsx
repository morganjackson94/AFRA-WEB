import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { cancelSubscriptionAction, startManyChatConnectAction, updateCardAction } from "./actions";
import { CopyLink } from "./CopyLink";
import { Check } from "../../components/Icons";
import { DegradedBanner } from "../../components/DegradedBanner";
import { PreviewTag } from "../../components/PreviewTag";
import { Reveal } from "../../components/Reveal";
import { SafeModeHandoff } from "../../components/SafeModeHandoff";
import { SectionLabel } from "../../components/SectionLabel";
import { Stagger } from "../../components/Stagger";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { describeBilling, describeReadiness, hiringLinkFor } from "../../lib/dashboard";
import { prisma } from "../../lib/prisma";
import { appBaseUrl, resolveOperatorId } from "../../lib/session";

export const dynamic = "force-dynamic";

// Asymmetric editorial grid: narrow label rail (left) + wide content (right).
const RAIL = "grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-[200px_1fr]";

const STAGES = [
  { key: "applied", label: "Applied" },
  { key: "screened", label: "Screened" },
  { key: "booked", label: "Booked" },
  { key: "showed", label: "Showed" },
] as const;

// ---------------------------------------------------------------------------
// State-driven dashboard. The hierarchy follows the operator's ACTUAL state so
// the "one thing to do right now" is the most prominent thing on the page (the
// 3-second test). State is DERIVED from existing readiness gates + candidate
// data — no readiness/provision/billing logic changes here. Presentation only.
// ---------------------------------------------------------------------------

type DashState = "not_live" | "live_quiet" | "live_active";

// The single most actionable fact, by state. New copy: composed, plain, no em
// dashes. Honesty preserved (never says live when it isn't).
const RIGHT_NOW_BY_GATE: Record<string, string> = {
  template: "Finish your hiring post to go live.",
  platform: "Connect Instagram to go live.",
  calendar: "Connect your calendar to go live.",
  billing: "Add billing to go live.",
};

// Gate metadata for the not-live "go live" block. Static for template/billing;
// platform is computed per-operator below (it's real once the founder has
// cloned a ManyChat flow for them — manychatConnectUrl — and stays an honest
// concierge note until then; calendar/reminders stay concierge until B2/A5).
type GateAction =
  | { kind: "link"; href: string }
  | { kind: "manychat-connect"; channelConnectionId: string }
  | { kind: "pending"; note: string };

type GateItem = { key: string; label: string; cta: string; action: GateAction };

function isToday(d: Date): boolean {
  return d.toDateString() === new Date().toDateString();
}

function whenLabel(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ operator?: string; checkout?: string; state?: string; preview?: string }>;
}) {
  const { operator: explicit, checkout, state: stateParam, preview } = await searchParams;
  const operatorId = await resolveOperatorId(explicit);

  // No valid session (not logged in, expired, or ?operator= didn't match the
  // authenticated operator) -> the dashboard is not public. Log in first.
  if (!operatorId) {
    redirect("/login");
  }

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      locations: {
        include: {
          calendarConnections: true,
          roles: { include: { screeningTemplate: true } },
          candidates: true,
          bookings: { include: { candidate: true } },
        },
      },
    },
  });

  if (!operator) {
    return <main className="min-h-screen bg-bg p-8 text-ink">Operator not found.</main>;
  }

  const roles = operator.locations.flatMap((l) => l.roles.map((r) => ({ role: r, location: l })));
  const candidates = operator.locations.flatMap((l) => l.candidates);
  const bookings = operator.locations.flatMap((l) => l.bookings);
  const billing = describeBilling(operator.billingStatus, operator.plan);
  const isFounding = operator.plan === "founding_annual";
  const awaitingPayment = checkout === "success" && operator.billingStatus !== "active";
  // The post-payment welcome moment (Part 2A): shows once, right after Stripe
  // hands them back with billingStatus already confirmed active. Branches on
  // whether the pool assignment hook found a flow or the pool was empty —
  // either way it's a deliberate, white-glove message, never a vague "wait".
  const justPaid = checkout === "success" && operator.billingStatus === "active";

  const creativeHref = `/dashboard/creative?operator=${operator.id}`;

  // ---- Derive state from existing readiness data (no new logic) ----
  const readiness = roles.map(({ role, location }) => ({ role, location, d: describeReadiness(role) }));
  const anyLive = readiness.some((r) => r.d.acceptingApplicants);
  const setupRoles = readiness.filter((r) => !r.d.acceptingApplicants);

  // Operator-level gate roll-up: a gate is "met" only if every role meets it.
  const gateMet: Record<string, boolean> = {
    template: roles.length > 0 && roles.every((r) => r.role.gateTemplate),
    platform: roles.length > 0 && roles.every((r) => r.role.gatePlatform),
    calendar: roles.length > 0 && roles.every((r) => r.role.gateCalendar),
    billing: roles.length > 0 && roles.every((r) => r.role.gateBilling),
  };
  const nextGate = ["template", "platform", "calendar", "billing"].find((k) => !gateMet[k]);

  // The operator-level messaging channel (Instagram). manychatConnectUrl is set
  // one of two ways: instantly, by the pool-assignment hook right after
  // founding payment (the primary path — see manychatPool.ts), or by the
  // founder by hand if the pool was empty at that moment. Either way, until
  // it's set there's genuinely nothing to connect to yet.
  const channel = operator.channelConnections[0];
  const platformAction: GateAction =
    channel?.status === "connecting"
      ? { kind: "pending", note: "Connecting. We'll confirm the moment it's linked." }
      : channel?.manychatConnectUrl
        ? { kind: "manychat-connect", channelConnectionId: channel.id }
        : {
            kind: "pending",
            note: "Being set up. We'll email you the moment Instagram is ready to connect.",
          };

  const GATE_ITEMS: GateItem[] = [
    { key: "template", label: "Hiring post", cta: "Finish hiring post", action: { kind: "link", href: creativeHref } },
    { key: "platform", label: "Instagram", cta: "Connect Instagram", action: platformAction },
    {
      key: "calendar",
      label: "Calendar",
      cta: "Connect calendar",
      action: {
        kind: "pending",
        note: operator.bookingLinkUrl
          ? "Booking link saved. We'll add it to your hiring flow."
          : "We're setting this up for you.",
      },
    },
    { key: "billing", label: "Billing", cta: "Add billing", action: { kind: "pending", note: "Managed below, under Plan & billing." } },
  ];

  // Preview overrides (presentational only): ?state= forces a hierarchy, and a
  // forced live_active with no real candidates gets sample applicants so the
  // active layout is meaningful to preview. ?preview=safe shows safe mode.
  const forced: DashState | undefined =
    stateParam === "not-live"
      ? "not_live"
      : stateParam === "live-quiet"
        ? "live_quiet"
        : stateParam === "live-active"
          ? "live_active"
          : undefined;
  const previewSafe = preview === "safe";

  const naturalState: DashState = !anyLive
    ? "not_live"
    : candidates.length === 0
      ? "live_quiet"
      : "live_active";
  const state: DashState = forced ?? naturalState;
  const isPreview = forced !== undefined || previewSafe;

  const sampleActive = forced === "live_active" && candidates.length === 0;
  const candidatesView: { id: string; name: string | null; contact: string | null; stage: string }[] =
    sampleActive
      ? [
          { id: "p1", name: "Maya R.", contact: "@maya", stage: "applied" },
          { id: "p2", name: "Devon K.", contact: "@devon", stage: "applied" },
          { id: "p3", name: "Sam T.", contact: "@sam", stage: "applied" },
          { id: "p4", name: "Priya N.", contact: "@priya", stage: "screened" },
          { id: "p5", name: "Lena P.", contact: "@lena", stage: "booked" },
        ]
      : candidates.map((c) => ({ id: c.id, name: c.name, contact: c.contact, stage: c.stage }));
  const bookingsView: { id: string; name: string | null; status: string; scheduledAt: Date | null }[] =
    sampleActive
      ? [{ id: "b1", name: "Lena P.", status: "scheduled", scheduledAt: new Date() }]
      : bookings.map((b) => ({
          id: b.id,
          name: b.candidate?.name ?? null,
          status: b.status,
          scheduledAt: b.scheduledAt,
        }));

  const waiting = candidatesView.filter((c) => c.stage === "applied" || c.stage === "screened");
  const interviewsToday = bookingsView.filter(
    (b) => b.scheduledAt && isToday(new Date(b.scheduledAt)) && b.status === "scheduled",
  );

  // Build QR data URLs server-side (no external calls).
  const links = await Promise.all(
    operator.locations.map(async (l) => {
      const url = hiringLinkFor(l.id, appBaseUrl());
      return { location: l, url, qr: await QRCode.toDataURL(url, { width: 200, margin: 1 }) };
    }),
  );

  // ---- The glanceable RIGHT NOW line (state-driven) ----
  let rightNow: React.ReactNode;
  if (state === "not_live") {
    rightNow = nextGate ? RIGHT_NOW_BY_GATE[nextGate] : "Finish setup to go live.";
  } else if (state === "live_quiet") {
    rightNow = "You're live. Share your hiring link to get applicants.";
  } else if (waiting.length > 0) {
    rightNow = (
      <>
        <span className="text-accent">{waiting.length}</span>{" "}
        {waiting.length === 1 ? "applicant is" : "applicants are"} waiting on you.
      </>
    );
  } else if (interviewsToday.length > 0) {
    rightNow = (
      <>
        <span className="text-accent">{interviewsToday.length}</span>{" "}
        {interviewsToday.length === 1 ? "interview" : "interviews"} today.
      </>
    );
  } else {
    rightNow = "Your pipeline is moving. Nothing needs you this second.";
  }

  const emptyApplied =
    state === "not_live"
      ? "Applicants show up here once you're live. Finish setup above."
      : "No applicants yet. Share your hiring link to start.";

  // ---- Reusable section blocks, composed per state below ----

  const liveConfirmation = (
    <section className="border-t border-line py-10">
      <div className={RAIL}>
        <SectionLabel index="01">Status</SectionLabel>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose" aria-hidden />
            <div>
              <p className="font-medium text-ink">You&apos;re live.</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Your hiring link is active and applicants can reach you.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-line-strong bg-cream px-3 py-1 text-xs font-semibold text-ink-soft">
            Accepting applicants
          </span>
        </div>
        {setupRoles.length > 0 && (
          <p className="text-sm text-ink-soft md:col-start-2">
            Still finishing setup on {setupRoles.length}{" "}
            {setupRoles.length === 1 ? "role" : "roles"}.{" "}
            <Link href={creativeHref} className="font-medium text-ink underline underline-offset-4">
              Pick up where you left off
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );

  // Primary CTA (the one amber moment) for whichever gate is next. A "pending"
  // action renders as a plain, non-clickable status pill — never a button that
  // does nothing when tapped.
  function primaryGateCta(g: GateItem) {
    if (g.action.kind === "link") {
      return (
        <Link
          href={g.action.href}
          className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition hover:opacity-90"
        >
          {g.cta}
        </Link>
      );
    }
    if (g.action.kind === "manychat-connect") {
      return (
        <form action={startManyChatConnectAction}>
          <input type="hidden" name="channelConnectionId" value={g.action.channelConnectionId} />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition hover:opacity-90"
          >
            {g.cta}
          </button>
        </form>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full border border-line-strong bg-cream px-5 py-2.5 text-sm font-medium text-ink-soft">
        {g.action.note}
      </span>
    );
  }

  // Checklist row action — same three shapes, compact sizing.
  function checklistGateAction(g: GateItem) {
    if (g.action.kind === "link") {
      return (
        <Link
          href={g.action.href}
          className="rounded-full border border-line-strong px-3.5 py-1 text-xs font-medium text-ink transition hover:bg-cream"
        >
          {g.cta}
        </Link>
      );
    }
    if (g.action.kind === "manychat-connect") {
      return (
        <form action={startManyChatConnectAction}>
          <input type="hidden" name="channelConnectionId" value={g.action.channelConnectionId} />
          <button
            type="submit"
            className="rounded-full border border-line-strong px-3.5 py-1 text-xs font-medium text-ink transition hover:bg-cream"
          >
            {g.cta}
          </button>
        </form>
      );
    }
    return (
      <span className="rounded-full border border-line-strong bg-cream px-3.5 py-1 text-xs font-medium text-ink-soft">
        {g.action.note}
      </span>
    );
  }

  const nextGateItem = GATE_ITEMS.find((g) => g.key === nextGate);

  const setupHero = (
    <section className="py-10 md:py-12">
      <div className={RAIL}>
        <Reveal>
          <SectionLabel index="01">Go live</SectionLabel>
        </Reveal>
        <Reveal>
          {/* The not-live hero: amber-framed honesty state. The ONE amber moment
              is the primary CTA — the lit window, the next step to take. */}
          <div className="rounded-2xl border border-accent bg-accent-soft p-7 md:p-8">
            <p className="max-w-[54ch] text-[15px] leading-relaxed text-ink">
              You&apos;re not accepting applicants yet. Connect the pieces below and your hiring link
              goes live.
            </p>

            <div className="mt-5">{nextGateItem && primaryGateCta(nextGateItem)}</div>

            <p className="mt-3 text-xs leading-relaxed text-faint">
              Instagram connects through ManyChat — one tap once it&apos;s set up for you. Calendar
              is a booking link (Google Calendar or Calendly) added on your setup call. Your hiring
              post is ready to finish now.
            </p>

            {/* The full gate checklist: clear, de-ghosted secondary actions. */}
            <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
              {GATE_ITEMS.map((g) => {
                const met = gateMet[g.key];
                return (
                  <li key={g.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className={met ? "text-ink-soft" : "text-ink"}>{g.label}</span>
                    {met ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-cream px-3 py-1 text-xs font-medium text-ink-soft">
                        <Check className="size-3.5" /> Done
                      </span>
                    ) : (
                      checklistGateAction(g)
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );

  const pipelineFull = (
    <section className="border-t border-line py-14 md:py-16">
      <div className={RAIL}>
        <Reveal>
          <SectionLabel index="02">Pipeline</SectionLabel>
        </Reveal>
        <div className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
            {STAGES.map((stage, i) => {
              const inStage = candidatesView.filter((c) => c.stage === stage.key);
              return (
                <div key={stage.key} className="flex flex-1 items-stretch">
                  <div className="flex-1 rounded-2xl border border-line bg-cream p-5">
                    <SectionLabel index={String(i + 1).padStart(2, "0")}>{stage.label}</SectionLabel>
                    <div className="t-numeral mt-4 text-[44px] leading-none text-ink">
                      {inStage.length}
                    </div>
                    <div className="mt-3 space-y-2">
                      {inStage.length === 0 ? (
                        <p className="text-xs text-faint">
                          {stage.key === "applied" ? emptyApplied : `Nothing ${stage.label.toLowerCase()}`}
                        </p>
                      ) : (
                        inStage.map((c) =>
                          sampleActive ? (
                            <div key={c.id} className="rounded-lg bg-card p-2 text-xs text-ink shadow-sm">
                              {c.name ?? c.contact ?? "Candidate"}
                            </div>
                          ) : (
                            <Link
                              key={c.id}
                              href={`/dashboard/candidates/${c.id}?operator=${operator.id}`}
                              className="block rounded-lg bg-card p-2 text-xs text-ink shadow-sm transition hover:bg-cream"
                            >
                              {c.name ?? c.contact ?? "Candidate"}
                            </Link>
                          ),
                        )
                      )}
                    </div>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className="hidden w-6 items-center justify-center text-line-strong md:flex">
                      →
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-line bg-card p-6">
            <SectionLabel>Booked interviews · billable</SectionLabel>
            {bookingsView.length === 0 ? (
              <p className="mt-3 text-sm text-faint">
                Booked interviews land here. They&apos;re what you&apos;re billed on.
              </p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-ink">
                {bookingsView.map((b) => (
                  <li key={b.id}>
                    {b.name ?? "Candidate"} · {b.status}
                    {b.scheduledAt ? ` · ${whenLabel(new Date(b.scheduledAt))}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {bookingsView.length > 0 && (
              <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
                Interview reminders: we handle these for you personally while one-tap reminders finishes
                in your dashboard.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  // Receded pipeline for not-live / live-quiet: present and honest, but quiet —
  // four zeros must not dominate. A compact strip + the intention-carrying empty
  // line that says WHY it's empty and WHAT unlocks it.
  const pipelineQuiet = (
    <section className="border-t border-line py-12">
      <div className={RAIL}>
        <SectionLabel index={state === "not_live" ? "02" : "03"}>Pipeline</SectionLabel>
        <div className="rounded-2xl border border-line bg-card p-6">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {STAGES.map((stage) => {
              const n = candidatesView.filter((c) => c.stage === stage.key).length;
              return (
                <div key={stage.key} className="flex items-baseline gap-2">
                  <span className="t-numeral text-2xl text-ink-soft">{n}</span>
                  <span className="text-xs uppercase tracking-[0.16em] text-faint">{stage.label}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-ink-soft">{emptyApplied}</p>
          <p className="mt-2 text-xs text-faint">
            Booked interviews land here. They&apos;re what you&apos;re billed on.
          </p>
        </div>
      </div>
    </section>
  );

  const hiringLinksHero = (
    <section className="border-t border-line py-14 md:py-16">
      <div className={RAIL}>
        <Reveal>
          <SectionLabel index="02">Share your hiring link</SectionLabel>
        </Reveal>
        <Stagger className="space-y-5" step={100}>
          {links.map(({ location, url, qr }) => (
            <div key={location.id} className="rounded-2xl border border-line bg-card p-6">
              <p className="mb-4 font-medium text-ink">{location.name}</p>
              <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                <div className="rounded-xl border border-line bg-bg p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`QR for ${location.name}`} width={132} height={132} />
                </div>
                <div className="w-full flex-1">
                  <CopyLink url={url} />
                  <p className="mt-2 text-xs text-faint">
                    Post it, put the QR in your window, or drop it in your bio. Applicants who tap it
                    land in your pipeline.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  );

  // Compact hiring-links for states where sharing isn't the headline action.
  const hiringLinksQuiet = (
    <section className="border-t border-line py-12">
      <div className={RAIL}>
        <SectionLabel index={state === "not_live" ? "03" : "04"}>Hiring links</SectionLabel>
        <Stagger className="space-y-3" step={80}>
          {links.map(({ location, url }) => (
            <div key={location.id} className="rounded-2xl border border-line bg-card p-5">
              <p className="mb-3 text-sm font-medium text-ink">{location.name}</p>
              <CopyLink url={url} />
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  );

  const billingSection = (
    <section className="border-t border-line py-12">
      <div className={RAIL}>
        <SectionLabel>Plan &amp; billing</SectionLabel>
        <div className="rounded-2xl border border-line bg-card p-6">
          <p className="text-sm">
            <span className="font-medium text-ink">{billing.label}</span>
            <span className="text-ink-soft"> — {billing.detail}</span>
          </p>
          {isFounding ? (
            <p className="mt-3 text-xs text-faint">
              Founding plan is a one-time annual charge — nothing recurring to manage. Within 30 days of
              payment, contact support for the money-back guarantee.
            </p>
          ) : (
            <div className="mt-4 flex gap-2">
              <form action={updateCardAction}>
                <input type="hidden" name="operatorId" value={operator.id} />
                <button className="rounded-full border border-line-strong px-4 py-1.5 text-sm text-ink hover:bg-cream">
                  Update card
                </button>
              </form>
              <form action={cancelSubscriptionAction}>
                <input type="hidden" name="operatorId" value={operator.id} />
                <button className="rounded-full border border-red-400/40 px-4 py-1.5 text-sm text-red-300 hover:bg-red-500/10">
                  Cancel subscription
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const safeModeSection = (
    <section className="border-t border-line py-10">
      <div className={RAIL}>
        <SectionLabel>Needs you</SectionLabel>
        <div className="space-y-4">
          <SafeModeHandoff
            preview
            name="Jordan M. · @jordanm"
            context="Hi! Do you offer any weekend shifts? I can start next week if so."
            askedAt="11 minutes ago"
          />
          <p className="text-sm text-ink-soft">
            This is safe mode: when we can&apos;t answer confidently we hand the applicant to you with
            context and one action, rather than guessing or going quiet.
          </p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <main className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        {awaitingPayment && (
          <div className="mb-8 rounded-2xl border border-accent bg-accent-soft p-4 text-sm text-ink">
            Confirming your payment… this updates the moment Stripe confirms it. Your plan activates on
            confirmed payment, not on this redirect.
          </div>
        )}

        {/* Post-payment welcome (Part 2A) — deliberate, white-glove, never
            vague. Shows once, right when checkout=success lands with billing
            already confirmed active (usually true by the time Stripe redirects
            back, since the webhook typically beats the browser here). */}
        {justPaid && (
          <div className="mb-8 rounded-2xl border border-accent bg-accent-soft p-5 text-sm leading-relaxed text-ink">
            {channel?.manychatConnectUrl ? (
              <>
                <span className="font-medium">You&apos;re in. Welcome, Founding Operator.</span>{" "}
                Connect your Instagram below to go live.
              </>
            ) : (
              <>
                <span className="font-medium">You&apos;re in. Welcome, Founding Operator.</span>{" "}
                We&apos;re personally setting up your account now. You&apos;ll get an email the moment
                your Instagram is ready to connect, usually within a few hours.
              </>
            )}
          </div>
        )}

        {/* Degraded-connection banner (preview): calm, never alarming. */}
        {previewSafe && (
          <div className="mb-8">
            <DegradedBanner preview channel="Instagram" />
          </div>
        )}

        <Reveal>
          <WorkspaceHeader operatorId={operator.id} name={operator.name} />
        </Reveal>

        {/* RIGHT NOW — the one truth, glanceable, sized to read in 3 seconds. */}
        <Reveal>
          <div className="mt-7 flex items-center gap-3">
            <p className="t-heading text-ink">{rightNow}</p>
            {isPreview && <PreviewTag />}
          </div>
        </Reveal>

        {/* Safe-mode hand-off leads when previewing it (it's the "needs you" moment). */}
        {previewSafe && safeModeSection}

        {/* State-driven hierarchy: lead with the next action, let the rest recede. */}
        {state === "not_live" && (
          <>
            {setupHero}
            {pipelineQuiet}
            {hiringLinksQuiet}
            {billingSection}
          </>
        )}

        {state === "live_quiet" && (
          <>
            {liveConfirmation}
            {hiringLinksHero}
            {pipelineQuiet}
            {billingSection}
          </>
        )}

        {state === "live_active" && (
          <>
            {liveConfirmation}
            {pipelineFull}
            {hiringLinksQuiet}
            {billingSection}
          </>
        )}
      </main>
    </div>
  );
}
