import { redirect } from "next/navigation";
import { CreativeEditor } from "./CreativeEditor";
import { WorkspaceHeader } from "../WorkspaceHeader";
import { Reveal } from "../../../components/Reveal";
import { prisma } from "../../../lib/prisma";
import { resolveOperatorId } from "../../../lib/session";
import { listTemplatePresets } from "../../../lib/templates";

export const dynamic = "force-dynamic";

export default async function CreativePage({
  searchParams,
}: {
  searchParams: Promise<{ operator?: string; role?: string }>;
}) {
  const { operator: explicit, role: roleParam } = await searchParams;
  const operatorId = await resolveOperatorId(explicit);
  if (!operatorId) redirect("/login");

  // Default to the operator's first role unless one is specified.
  const role = await prisma.role.findFirst({
    where: roleParam
      ? { id: roleParam }
      : { location: { operatorId } },
    include: { screeningTemplate: true, location: { include: { operator: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!role || !role.screeningTemplate) {
    return (
      <main className="min-h-screen bg-bg p-8 text-ink">
        No editable hiring post found for this operator.
      </main>
    );
  }

  const slots = (role.screeningTemplate.slots ?? {}) as Record<string, string>;
  const presets = listTemplatePresets();
  const activePresetId = role.screeningTemplate.sourceTemplateId ?? undefined;
  const activePreset = presets.find((p) => p.id === activePresetId);

  return (
    <div className="min-h-screen bg-bg text-ink">
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12 md:py-16">
      <Reveal>
        <WorkspaceHeader operatorId={operatorId} name={role.location.operator.name} />
      </Reveal>

      <p className="text-sm text-ink-soft">
        Editing: <span className="font-medium text-ink">{role.title}</span> · {role.location.name}
      </p>

      <p className="rounded-2xl border border-line bg-cream p-4 text-sm leading-relaxed text-ink-soft">
        This is your <strong className="font-semibold text-ink">hiring post</strong> — not the ad. You
        edit text and the photo over a locked layout. Saved text is checked for employment-compliance
        issues before it can go out.
      </p>

      <CreativeEditor
        roleId={role.id}
        initialSlots={{
          headline: slots.headline ?? "",
          roleLabel: slots.roleLabel ?? "",
          payLabel: slots.payLabel ?? "",
          cta: slots.cta ?? "",
        }}
        photoRef={role.screeningTemplate.photoRef ?? ""}
        templatePhotoRef={activePreset?.photoRef ?? role.screeningTemplate.photoRef ?? ""}
        presets={presets.map((p) => ({ id: p.id, name: p.name }))}
        activePresetId={activePresetId}
      />
    </main>
    </div>
  );
}
