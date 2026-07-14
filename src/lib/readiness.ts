// Readiness gates — THE single source of truth for whether a Role is live.
//
// Honesty rule (the whole point of this module): a STUBBED connection is NOT a
// connected one. The platform and calendar gates only flip true when the real
// integration reports status === "connected". Nothing else may set gate state;
// provisioning, the dashboard, and the real-connection code all call this.

const REQUIRED_SLOTS = ["headline", "roleLabel", "payLabel"] as const;

/** The status value an integration reports once it is genuinely live. */
export const CONNECTED = "connected";

/** Billing statuses that count as "paying or in a paid trial" => gateBilling true. */
export const BILLING_ACTIVE_STATUSES = ["trialing", "active"] as const;

/** Single rule for "is billing live". Used inside evaluateReadiness(); exported
 *  so billing code can describe state without re-implementing the predicate. */
export function isBillingActive(billingStatus?: string | null): boolean {
  return BILLING_ACTIVE_STATUSES.includes(billingStatus as never);
}

export type ReadinessContext = {
  /** ChannelConnection.status for the operator's messaging channel (or null). */
  channelStatus?: string | null;
  /** CalendarConnection.status for the location's calendar (or null). */
  calendarStatus?: string | null;
  /** The role's screening template (anything carrying a `slots` object). */
  template?: { slots?: unknown } | null;
  /** Operator.billingStatus — gateBilling is DERIVED from this, never passed in. */
  billingStatus?: string | null;
};

export type ReadinessResult = {
  gatePlatform: boolean;
  gateCalendar: boolean;
  gateTemplate: boolean;
  gateBilling: boolean;
  /** "pending" (not configured) | "ready" (configured, awaiting live deps) | "live" */
  readinessState: "pending" | "ready" | "live";
};

/** A template is valid once every required editable slot holds non-empty text. */
export function isValidTemplate(template?: { slots?: unknown } | null): boolean {
  if (!template || typeof template.slots !== "object" || template.slots === null) {
    return false;
  }
  const slots = template.slots as Record<string, unknown>;
  return REQUIRED_SLOTS.every(
    (key) => typeof slots[key] === "string" && (slots[key] as string).trim().length > 0,
  );
}

/**
 * Compute the four gates and the overall readiness state from a context.
 * Callers build the context from the role's related connections + billing, e.g.
 *   evaluateReadiness({
 *     channelStatus: operator.channelConnections[0]?.status,
 *     calendarStatus: location.calendarConnections[0]?.status,
 *     template: role.screeningTemplate,
 *     billingStatus: operator.billingStatus,
 *   })
 */
export function evaluateReadiness(ctx: ReadinessContext): ReadinessResult {
  // Stubbed/null/error => false. Only an explicit "connected" counts.
  const gatePlatform = ctx.channelStatus === CONNECTED;
  const gateCalendar = ctx.calendarStatus === CONNECTED;
  const gateTemplate = isValidTemplate(ctx.template);
  const gateBilling = isBillingActive(ctx.billingStatus);

  const allMet = gatePlatform && gateCalendar && gateTemplate && gateBilling;

  const readinessState: ReadinessResult["readinessState"] = allMet
    ? "live"
    : gateTemplate
      ? "ready" // configured, but awaiting live channel/calendar/billing
      : "pending";

  return { gatePlatform, gateCalendar, gateTemplate, gateBilling, readinessState };
}
