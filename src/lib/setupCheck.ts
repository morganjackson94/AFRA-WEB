import type { PrismaClient } from "../generated/prisma/client";
import { DISQUALIFIERS } from "./onboardingOptions";
import { FOLLOWER_BANDS, HIRING_FREQUENCIES, LOCATION_BUCKETS } from "./qualification";
import { isBillingActive } from "./readiness";

// One place that answers "is this client really set up?" for the Fulfillment
// Rep. Used by the setup checker page (/admin/setup) and the handoff email.
//
// The check that matters most is `webhook`: if the ManyChat External Request
// step is skipped or mis-wired, everything still looks fine to the operator,
// but no Candidate ever reaches AFRA, so we never see candidates and never
// count the trial. Every candidate the webhook accepts creates a Candidate
// row on one of this operator's locations (ingestScreeningResult,
// manychat.ts), so "at least one Candidate exists" is the proof a real DM
// made it all the way through.

/** The keyword the free hiring post and the caption tell applicants to DM. */
export const DEFAULT_KEYWORD = "JOBS";

export type CheckState = "pass" | "fail" | "manual";
export type SetupCheck = { id: string; label: string; state: CheckState; detail: string };

export type SetupSummary = {
  operatorId: string;
  businessName: string;
  email: string;
  handle: string | null;
  billingStatus: string;
  sourceAe: string | null;
  locations: { id: string; name: string }[];
  roles: { title: string; pay: string | null }[];
  bookingLinkUrl: string | null;
  calendar: string | null;
  locationsLabel: string;
  followersLabel: string;
  lowReach: boolean;
  hiringLabel: string;
  dealBreakers: string[];
  state: string | null;
  candidateCount: number;
  firstCandidateAt: Date | null;
  lastCandidateAt: Date | null;
  createdAt: Date;
  /** The three values the Rep pastes into the copied Master Flow's first step. */
  manychatBlanks: { businessName: string; bookingLink: string; locationId: string };
  keyword: string;
  caption: string;
  checks: SetupCheck[];
  /** Every automatic check passed (manual ones are the Rep's to confirm). */
  readyToGoLive: boolean;
};

const label = (list: readonly { value: string; label: string }[], v: string | null | undefined) =>
  list.find((o) => o.value === v)?.label ?? "Not answered";

function joinRoles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? "team members";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/** The caption for the operator to repost their hiring picture with. */
export function buildCaption(businessName: string, roleTitles: string[], keyword = DEFAULT_KEYWORD): string {
  return `We're hiring! ${businessName} is looking for ${joinRoles(roleTitles)}. DM us ${keyword} to apply. It takes 2 minutes, no resume needed.`;
}

export async function getSetupSummary(prisma: PrismaClient, operatorId: string): Promise<SetupSummary | null> {
  const op = await prisma.operator.findUnique({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      locations: {
        orderBy: { createdAt: "asc" },
        include: { roles: { orderBy: { createdAt: "asc" } }, calendarConnections: true },
      },
    },
  });
  if (!op) return null;

  const locationIds = op.locations.map((l) => l.id);
  const [candidateCount, first, last] = await Promise.all([
    prisma.candidate.count({ where: { locationId: { in: locationIds } } }),
    prisma.candidate.findFirst({ where: { locationId: { in: locationIds } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.candidate.findFirst({ where: { locationId: { in: locationIds } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const instagram = op.channelConnections.find((c) => c.provider === "instagram") ?? null;
  // Roles are cloned per location; list each title once.
  const seen = new Set<string>();
  const roles: { title: string; pay: string | null }[] = [];
  for (const loc of op.locations)
    for (const r of loc.roles)
      if (!seen.has(r.title)) {
        seen.add(r.title);
        roles.push({ title: r.title, pay: r.payText });
      }

  const firstLocationId = op.locations[0]?.id ?? "";
  const bookingLinkUrl = op.bookingLinkUrl?.trim() || null;
  const paid = isBillingActive(op.billingStatus);
  const igConnected = instagram?.status === "connected";
  const businessName = op.name;

  const checks: SetupCheck[] = [
    {
      id: "paid",
      label: "Paid the $149",
      state: paid ? "pass" : "fail",
      detail: paid ? `Billing: ${op.billingStatus}` : `Billing: ${op.billingStatus}. Don't build until this is paid.`,
    },
    {
      id: "locationId",
      label: "Has a Location ID",
      state: firstLocationId ? "pass" : "fail",
      detail: firstLocationId
        ? `${op.locations.length} location${op.locations.length === 1 ? "" : "s"}. First: ${firstLocationId}`
        : "No location on file.",
    },
    {
      id: "bookingLink",
      label: "Booking link on file",
      state: bookingLinkUrl ? "pass" : "fail",
      detail: bookingLinkUrl ?? "Missing. Get it before you build their ManyChat.",
    },
    {
      id: "instagram",
      label: "Instagram connected (admin confirm done)",
      state: igConnected ? "pass" : "fail",
      detail: igConnected
        ? `Connected${instagram?.handle ? ` (${instagram.handle})` : ""}`
        : `Status: ${instagram?.status ?? "none"}. Happens on the 10-minute call.`,
    },
    {
      id: "webhook",
      label: "A test candidate reached AFRA",
      state: candidateCount > 0 ? "pass" : "fail",
      detail:
        candidateCount > 0
          ? `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}. First at ${first?.createdAt.toISOString()}`
          : "None yet. DM their keyword and finish the questions. If nothing lands, the webhook step is missing or wrong.",
    },
    {
      id: "sheet",
      label: "The same test candidate is in their Google Sheet",
      state: "manual",
      detail: "Check by eye. AFRA can't see their Sheet.",
    },
  ];

  return {
    operatorId: op.id,
    businessName,
    email: op.email,
    handle: instagram?.handle ?? null,
    billingStatus: op.billingStatus,
    sourceAe: op.sourceAe,
    locations: op.locations.map((l) => ({ id: l.id, name: l.name })),
    roles,
    bookingLinkUrl,
    calendar: op.locations[0]?.calendarConnections[0]?.provider ?? null,
    locationsLabel: label(LOCATION_BUCKETS, op.locationsBucket),
    followersLabel: label(FOLLOWER_BANDS, op.followerBand),
    lowReach: op.reachFlag,
    hiringLabel: label(HIRING_FREQUENCIES, op.hiringFrequency),
    dealBreakers: op.disqualifiers.map((d) => label(DISQUALIFIERS, d)),
    state: op.locationStates[0] ?? null,
    candidateCount,
    firstCandidateAt: first?.createdAt ?? null,
    lastCandidateAt: last?.createdAt ?? null,
    createdAt: op.createdAt,
    manychatBlanks: { businessName, bookingLink: bookingLinkUrl ?? "[MISSING: get it first]", locationId: firstLocationId },
    keyword: DEFAULT_KEYWORD,
    caption: buildCaption(businessName, roles.map((r) => r.title)),
    checks,
    readyToGoLive: checks.every((c) => c.state !== "fail"),
  };
}
