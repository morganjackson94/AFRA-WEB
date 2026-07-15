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
  // Checkout consent (Tier 2). Unlike the qualification fields above, this
  // one IS enforced — startOnboardingAction rejects the submission server-side
  // if the operator didn't check the consent box. See tosAcceptedAt/tosVersion
  // on Operator and LEGAL_DOC_VERSION in legalDocs.ts.
  tosAccepted?: boolean;
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
 * Turn the 3 onboarding inputs into a complete, queryable operator instance:
 * Operator -> Location -> Role -> ScreeningTemplate (cloned from the system
 * default) + a stubbed ChannelConnection and a stubbed CalendarConnection.
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
  const pay = parsePay(inputs.role.pay);

  // System-default template to clone from (created on first provision; idempotent).
  const systemDefault = await ensureSystemDefaultTemplate(prisma);

  const result = await prisma.$transaction(async (tx) => {
    // Operator — billing not yet wired. "trial_pending" until Step 3 (Stripe).
    // Stubbed messaging channel: real token/pageId land with B1 (post App Review).
    const operator = await tx.operator.create({
      data: {
        name: operatorName,
        email,
        billingStatus: "trial_pending",
        locationsBucket: inputs.locationsBucket,
        followerBand: inputs.followerBand,
        hiringFrequency: inputs.hiringFrequency,
        reachFlag: inputs.reachFlag ?? false,
        bookingLinkUrl: inputs.bookingLinkUrl,
        tosAcceptedAt: inputs.tosAccepted ? new Date() : null,
        tosVersion: inputs.tosAccepted ? LEGAL_DOC_VERSION : null,
        channelConnections: {
          create: [{ provider: "instagram", handle: displayHandle, status: "stubbed" }],
        },
      },
    });

    // One default Location (first-class; multi-location is a later additive step).
    // Stubbed calendar: real token lands with B2 (post Google verify).
    const location = await tx.location.create({
      data: {
        operatorId: operator.id,
        name: `${operatorName} — Main`,
        timezone,
        businessHours: DEFAULT_BUSINESS_HOURS,
        calendarConnections: {
          create: [{ provider: inputs.calendarChoice || "other", status: "stubbed" }],
        },
      },
    });

    // Role under that Location.
    const role = await tx.role.create({
      data: {
        locationId: location.id,
        title: inputs.role.title,
        payText: pay.payText,
        payRate: pay.payRate,
        payPeriod: pay.payPeriod,
        hours: inputs.role.hours ?? null,
      },
    });

    // ScreeningTemplate cloned from the system default, with role-specific slots.
    const template = await tx.screeningTemplate.create({
      data: {
        roleId: role.id,
        isSystemDefault: false,
        sourceTemplateId: systemDefault.id,
        name: `${inputs.role.title} — ${operatorName}`,
        slots: {
          ...SYSTEM_DEFAULT_TEMPLATE.slots,
          roleLabel: inputs.role.title,
          payLabel: pay.payText ?? "Competitive pay",
        },
        photoRef: systemDefault.photoRef,
      },
    });

    // HONEST initial readiness via the single source of truth. Channel + calendar
    // stubbed (=> false), template is a valid clone (=> true), billing not yet
    // wired (=> false). Net: "ready", never "live".
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

    return { operator, location, role: updatedRole, template, readiness };
  });

  const operatorId = result.operator.id;

  // StartedSetup — fires at provisioning start (a real signup intent). Idempotent
  // and server-side. Emitted after the core instance exists so we have the id.
  const startedSetup = await emitEvent(prisma, {
    operatorId,
    type: "StartedSetup",
    payload: { instagramHandle: displayHandle, roleTitle: inputs.role.title },
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
