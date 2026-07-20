import { startTrial } from "./activation";
import { type BillingProvider, getBillingProvider } from "./billing";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_TIMEZONE } from "./constants";
import { emitEvent } from "./events";
import { LEGAL_DOC_VERSION } from "./legalDocs";
import type { PrismaClient } from "../generated/prisma/client";
import { evaluateReadiness } from "./readiness";
import { ensureSystemDefaultTemplate, SYSTEM_DEFAULT_TEMPLATE } from "./templates";

// The 3 minimum-friction onboarding inputs. Operator identity is synthesized
// from the handle for now (real onboarding will attach it via auth); Location is
// implied — one default Location per Operator. Locations stay first-class, so
// multi-location is a later additive change, not a refactor.
export type ProvisionInputs = {
  instagramHandle: string;
  role: { title: string; pay?: string; hours?: string };
  // Multi-role support (Onboarding Wizard redesign). When present and
  // non-empty, takes precedence over the singular `role` above for what
  // actually gets created — `role` stays required for existing single-role
  // callers (real-launch-operator script, older smoke tests) and doubles as
  // the default when `roles` is omitted. Every entry is created under EVERY
  // Location provisioned (see `locationCount`) — multi-location operators are
  // assumed to hire for the same role set everywhere; per-location role
  // assignment isn't part of this pass.
  roles?: { title: string; pay?: string; hours?: string }[];
  // How many Location rows to create (default 1, matching prior behavior).
  // All created Locations share the same timezone/business-hours defaults —
  // per-location naming/address detail is set later in the dashboard.
  locationCount?: number;
  calendarChoice: string; // "google" | "microsoft" | "other"
  // Founding-cohort calendar workaround (B2 real integration is a deferred
  // stub — see calendar.ts). Optional; often set up together with the founder
  // on the concierge call rather than alone at onboarding.
  bookingLinkUrl?: string;
  // Optional overrides (real onboarding supplies these; synthesized if absent).
  operatorName?: string;
  operatorEmail?: string;
  timezone?: string;
  // Founding-qualification soft signal (see qualification.ts). Purely
  // informational — provision() never branches on these; they're just
  // persisted for concierge use. All optional since only the founding path
  // collects them today.
  locationsBucket?: string;
  followerBand?: string;
  hiringFrequency?: string;
  reachFlag?: boolean;
  // Jurisdiction restriction (HARD gate, unlike the soft signals above — see
  // src/lib/jurisdiction.ts). By the time provision() runs, startOnboardingAction
  // has already rejected any restricted combination, so these are just the
  // confirmed-clear answers being persisted for the record.
  locationStates?: string[];
  hasNycLocation?: boolean;
  // Screener input (Onboarding Wizard step 5) — raw capture only, purely
  // informational like the qualification fields above. Parsing badHireText
  // into screener questions is a separate, not-yet-built pass.
  disqualifiers?: string[];
  badHireText?: string;
  // Checkout consent (Tier 2). Unlike the qualification fields above, this
  // one IS enforced — startOnboardingAction rejects the submission server-side
  // if the operator didn't check the consent box. See tosAcceptedAt/tosVersion
  // on Operator and LEGAL_DOC_VERSION in legalDocs.ts.
  tosAccepted?: boolean;
  // Optional second stubbed ChannelConnection, mirroring the Instagram one
  // below exactly. Real tokens land with B1, same as Instagram.
  facebookHandle?: string;
};

/** Normalize an IG handle to a lowercase slug usable in emails/ids. */
function slugifyHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._]/g, "");
}

/** Best-effort parse of a free-text pay string into structured rate + period. */
function parsePay(pay?: string): {
  payText: string | null;
  payRate: number | null;
  payPeriod: string;
} {
  const text = pay?.trim();
  if (!text) return { payText: null, payRate: null, payPeriod: "hour" };

  const numMatch = text.match(/(\d+(?:\.\d+)?)/);
  const payRate = numMatch ? parseFloat(numMatch[1]) : null;

  const lower = text.toLowerCase();
  let payPeriod = "hour";
  if (/(year|\/yr|per\s*yr|annual)/.test(lower)) payPeriod = "year";
  else if (/(month|\/mo|per\s*mo)/.test(lower)) payPeriod = "month";
  else if (/shift/.test(lower)) payPeriod = "shift";

  return { payText: text, payRate, payPeriod };
}

export type ProvisionOptions = {
  /** Billing provider (real Stripe when STRIPE_SECRET_KEY is set, else fake). */
  billing?: BillingProvider;
  /** Start the 2-week trial as part of provisioning (default true). */
  startTrial?: boolean;
};

export type ProvisionResult = Awaited<ReturnType<typeof provision>>;

/**
 * Turn the onboarding inputs into a complete, queryable operator instance:
 * Operator -> Location(s) -> Role(s) -> ScreeningTemplate (cloned from the
 * system default) + stubbed ChannelConnection(s) and CalendarConnection(s).
 * `locationCount`/`roles` are optional and default to one Location with the
 * single `role` — existing single-role/single-location callers are unaffected.
 *
 * Readiness gates are set HONESTLY via evaluateReadiness(): with the channel and
 * calendar stubbed and billing not yet wired, a freshly provisioned instance
 * reads readinessState !== "live" by design.
 */
export async function provision(
  prisma: PrismaClient,
  inputs: ProvisionInputs,
  opts: ProvisionOptions = {},
) {
  const billing = opts.billing ?? getBillingProvider();
  const shouldStartTrial = opts.startTrial ?? true;
  const slug = slugifyHandle(inputs.instagramHandle) || "operator";
  const displayHandle = `@${slug}`;
  const operatorName = inputs.operatorName ?? displayHandle;
  const email = inputs.operatorEmail ?? `${slug}@pending.afra.local`;
  const timezone = inputs.timezone ?? DEFAULT_TIMEZONE;
  const roleEntries = inputs.roles && inputs.roles.length > 0 ? inputs.roles : [inputs.role];
  const locationCount = Math.max(1, inputs.locationCount ?? 1);

  // System-default template to clone from (created on first provision; idempotent).
  const systemDefault = await ensureSystemDefaultTemplate(prisma);

  const result = await prisma.$transaction(async (tx) => {
    // Operator — billing not yet wired. "trial_pending" until Step 3 (Stripe).
    // Stubbed messaging channels: real token/pageId land with B1 (post App Review).
    const operator = await tx.operator.create({
      data: {
        name: operatorName,
        email,
        billingStatus: "trial_pending",
        locationsBucket: inputs.locationsBucket,
        followerBand: inputs.followerBand,
        hiringFrequency: inputs.hiringFrequency,
        reachFlag: inputs.reachFlag ?? false,
        locationStates: inputs.locationStates ?? [],
        hasNycLocation: inputs.hasNycLocation ?? false,
        disqualifiers: inputs.disqualifiers ?? [],
        badHireText: inputs.badHireText,
        bookingLinkUrl: inputs.bookingLinkUrl,
        tosAcceptedAt: inputs.tosAccepted ? new Date() : null,
        tosVersion: inputs.tosAccepted ? LEGAL_DOC_VERSION : null,
        channelConnections: {
          create: [
            { provider: "instagram", handle: displayHandle, status: "stubbed" },
            ...(inputs.facebookHandle
              ? [{ provider: "facebook", handle: inputs.facebookHandle, status: "stubbed" }]
              : []),
          ],
        },
      },
    });

    // `locationCount` Locations (default 1, matching prior single-Location
    // behavior exactly — same name, "— Main" — when count is 1). Every entry
    // in `roleEntries` is created under every Location.
    const locations = [];
    for (let i = 0; i < locationCount; i++) {
      const location = await tx.location.create({
        data: {
          operatorId: operator.id,
          name: locationCount === 1 ? `${operatorName} — Main` : `${operatorName} — Location ${i + 1}`,
          timezone,
          businessHours: DEFAULT_BUSINESS_HOURS,
          calendarConnections: {
            create: [{ provider: inputs.calendarChoice || "other", status: "stubbed" }],
          },
        },
      });

      const roles = [];
      for (const roleInput of roleEntries) {
        const pay = parsePay(roleInput.pay);

        const role = await tx.role.create({
          data: {
            locationId: location.id,
            title: roleInput.title,
            payText: pay.payText,
            payRate: pay.payRate,
            payPeriod: pay.payPeriod,
            hours: roleInput.hours ?? null,
          },
        });

        // ScreeningTemplate cloned from the system default, with role-specific slots.
        const template = await tx.screeningTemplate.create({
          data: {
            roleId: role.id,
            isSystemDefault: false,
            sourceTemplateId: systemDefault.id,
            name: `${roleInput.title} — ${operatorName}`,
            slots: {
              ...SYSTEM_DEFAULT_TEMPLATE.slots,
              roleLabel: roleInput.title,
              payLabel: pay.payText ?? "Competitive pay",
            },
            photoRef: systemDefault.photoRef,
          },
        });

        // HONEST initial readiness via the single source of truth. Channel and
        // calendar stubbed (=> false), template is a valid clone (=> true),
        // billing not yet wired (=> false). Net: "ready", never "live".
        const readiness = evaluateReadiness({
          channelStatus: "stubbed",
          calendarStatus: "stubbed",
          template,
          billingStatus: "trial_pending",
        });

        const updatedRole = await tx.role.update({
          where: { id: role.id },
          data: readiness,
        });

        roles.push({ role: updatedRole, template, readiness });
      }

      locations.push({ location, roles });
    }

    return { operator, locations };
  });

  const operatorId = result.operator.id;

  // StartedSetup — fires at provisioning start (a real signup intent). Idempotent
  // and server-side. Emitted after the core instance exists so we have the id.
  const startedSetup = await emitEvent(prisma, {
    operatorId,
    type: "StartedSetup",
    payload: { instagramHandle: displayHandle, roleTitle: roleEntries.map((r) => r.title).join(", ") },
  });

  // Start the 2-week trial ($199/mo per location). This advances billingStatus
  // (trial_pending -> trialing) and recomputes readiness so gateBilling flows
  // through evaluateReadiness(). It does NOT make the instance live (channel +
  // calendar are still stubbed), so WentLive will not fire here.
  let billingResult: Awaited<ReturnType<typeof startTrial>> | null = null;
  if (shouldStartTrial) {
    billingResult = await startTrial(prisma, billing, operatorId);
  }

  // Return the freshly-recomputed tree.
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      events: true,
      locations: {
        include: {
          calendarConnections: true,
          roles: { include: { screeningTemplate: true } },
        },
      },
    },
  });

  return {
    operatorId,
    operator,
    startedSetupFired: startedSetup.fired,
    billing: billingResult,
  };
}
