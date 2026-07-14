"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { recomputeOperatorReadiness } from "../../../lib/activation";
import { type Violation, validateCreativeText } from "../../../lib/creative";
import { type Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/prisma";
import { isValidTemplate } from "../../../lib/readiness";
import { getTemplatePreset } from "../../../lib/templates";

export type SaveTextState = {
  ok: boolean;
  violations: Violation[];
  message?: string;
};

async function templateForRole(roleId: string) {
  const tmpl = await prisma.screeningTemplate.findUnique({ where: { roleId } });
  if (!tmpl) throw new Error("No template for role");
  return tmpl;
}

async function operatorIdForRole(roleId: string): Promise<string> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { id: roleId },
    select: { location: { select: { operatorId: true } } },
  });
  return role.location.operatorId;
}

/** Level 2 — save edited text slots. Validates BEFORE persisting; a bad string
 *  is rejected with plain-language reasons and never reaches the DB. */
export async function saveCreativeTextAction(
  _prev: SaveTextState,
  formData: FormData,
): Promise<SaveTextState> {
  const roleId = String(formData.get("roleId"));
  const tmpl = await templateForRole(roleId);
  const prevSlots = (tmpl.slots ?? {}) as Record<string, unknown>;

  const nextSlots: Record<string, unknown> = {
    ...prevSlots,
    headline: String(formData.get("headline") ?? "").trim(),
    roleLabel: String(formData.get("roleLabel") ?? "").trim(),
    payLabel: String(formData.get("payLabel") ?? "").trim(),
    cta: String(formData.get("cta") ?? "").trim(),
  };

  // Compliance guard — the critical check.
  const result = validateCreativeText(nextSlots);
  if (!result.ok) {
    return { ok: false, violations: result.violations };
  }

  // Required-field contract (keeps isValidTemplate() true after save).
  if (!isValidTemplate({ slots: nextSlots })) {
    return {
      ok: false,
      violations: [],
      message: "Headline, role, and pay can't be empty.",
    };
  }

  await prisma.screeningTemplate.update({
    where: { roleId },
    data: { slots: nextSlots as Prisma.InputJsonValue },
  });

  // Template stays the template gate's input — recompute so gates stay honest.
  await recomputeOperatorReadiness(prisma, await operatorIdForRole(roleId));
  revalidatePath("/dashboard/creative");
  return { ok: true, violations: [], message: "Saved." };
}

/** Level 1 — pick a finished template. Identity (role/pay) is auto-filled from
 *  the operator's existing role data into the locked layout's slots. */
export async function pickTemplateAction(formData: FormData): Promise<void> {
  const roleId = String(formData.get("roleId"));
  const presetId = String(formData.get("presetId"));
  const preset = getTemplatePreset(presetId);
  if (!preset) throw new Error("Unknown template preset");

  const role = await prisma.role.findUniqueOrThrow({ where: { id: roleId } });
  const slots = {
    ...preset.slots,
    roleLabel: role.title, // identity auto-fill
    payLabel: role.payText ?? preset.slots.payLabel,
  };

  await prisma.screeningTemplate.update({
    where: { roleId },
    data: { slots, photoRef: preset.photoRef, sourceTemplateId: preset.id },
  });
  revalidatePath("/dashboard/creative");
}

/** Level 3 — swap the photo: use the template image, or upload one into the
 *  fixed frame. Image hosting is a local stub store this session (public/uploads),
 *  but the photoRef field + swap flow are real. */
export async function swapPhotoAction(formData: FormData): Promise<void> {
  const roleId = String(formData.get("roleId"));
  const mode = String(formData.get("mode"));

  let photoRef: string;
  if (mode === "template") {
    photoRef = String(formData.get("templatePhotoRef"));
  } else {
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("No image uploaded");
    }
    if (!file.type.startsWith("image/")) {
      throw new Error("Uploaded file must be an image");
    }
    const ext = (path.extname(file.name) || ".png").toLowerCase();
    const filename = `${roleId}-${Date.now()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    photoRef = `/uploads/${filename}`; // servable path
  }

  await prisma.screeningTemplate.update({ where: { roleId }, data: { photoRef } });
  revalidatePath("/dashboard/creative");
}
