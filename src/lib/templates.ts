import type { PrismaClient } from "../generated/prisma/client";

export type TemplatePreset = {
  /** Stable id used by the Level-1 picker. */
  id: string;
  name: string;
  slots: { headline: string; roleLabel: string; payLabel: string; cta: string };
  photoRef: string;
};

// The finished hiring-post templates an operator picks from (Level 1). Small,
// bounded library — these are the LOCKED layouts; operators edit slots over them,
// never the layout itself. Slot keys are the editableFields contract validated by
// isValidTemplate().
export const TEMPLATE_LIBRARY: TemplatePreset[] = [
  {
    id: "staff-counter-default",
    name: "STAFF — Counter Hire (default)",
    slots: {
      headline: "We're Hiring!",
      roleLabel: "Team Member",
      payLabel: "Competitive pay",
      cta: "Tap to apply — quick chat, no resume needed.",
    },
    photoRef: "templates/staff-counter-default.jpg",
  },
  {
    id: "urgent-now-hiring",
    name: "STAFF — Now Hiring (urgent)",
    slots: {
      headline: "Now Hiring — Start This Week",
      roleLabel: "Team Member",
      payLabel: "Competitive pay",
      cta: "Tap to apply — we reply fast.",
    },
    photoRef: "templates/urgent-now-hiring.jpg",
  },
  {
    id: "friendly-join-team",
    name: "STAFF — Join Our Team (friendly)",
    slots: {
      headline: "Join Our Team",
      roleLabel: "Team Member",
      payLabel: "Competitive pay",
      cta: "Tap to apply — 2-minute chat, no resume needed.",
    },
    photoRef: "templates/friendly-join-team.jpg",
  },
];

/** Back-compat alias: the canonical default is the first library preset. */
export const SYSTEM_DEFAULT_TEMPLATE = TEMPLATE_LIBRARY[0];

export function listTemplatePresets(): TemplatePreset[] {
  return TEMPLATE_LIBRARY;
}

export function getTemplatePreset(id: string): TemplatePreset | undefined {
  return TEMPLATE_LIBRARY.find((t) => t.id === id);
}

/**
 * Find-or-create the canonical system-default template (idempotent).
 * provision() calls this so it works on a fresh DB without the seed having run.
 */
export async function ensureSystemDefaultTemplate(prisma: PrismaClient) {
  const existing = await prisma.screeningTemplate.findFirst({
    where: { isSystemDefault: true, name: SYSTEM_DEFAULT_TEMPLATE.name },
  });
  if (existing) return existing;
  return prisma.screeningTemplate.create({
    data: {
      isSystemDefault: true,
      name: SYSTEM_DEFAULT_TEMPLATE.name,
      slots: SYSTEM_DEFAULT_TEMPLATE.slots,
      photoRef: SYSTEM_DEFAULT_TEMPLATE.photoRef,
    },
  });
}
