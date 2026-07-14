"use client";

import { useActionState, useState } from "react";
import {
  pickTemplateAction,
  type SaveTextState,
  saveCreativeTextAction,
  swapPhotoAction,
} from "./actions";
import { Check } from "../../../components/Icons";
import { SectionLabel } from "../../../components/SectionLabel";

type Slots = { headline: string; roleLabel: string; payLabel: string; cta: string };

const INITIAL: SaveTextState = { ok: true, violations: [] };

const inputClass =
  "mt-2 w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-sm focus:border-ink focus:outline-2 focus:outline-ink";

export function CreativeEditor(props: {
  roleId: string;
  initialSlots: Slots;
  photoRef: string;
  templatePhotoRef: string;
  presets: { id: string; name: string }[];
  activePresetId?: string;
}) {
  const [slots, setSlots] = useState<Slots>(props.initialSlots);
  const [state, formAction, pending] = useActionState(saveCreativeTextAction, INITIAL);

  function set<K extends keyof Slots>(key: K, value: string) {
    setSlots((s) => ({ ...s, [key]: value }));
  }

  const isUploaded = props.photoRef.startsWith("/uploads/");

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
      {/* ---------------- Editor ---------------- */}
      <div className="space-y-10">
        {/* Level 1 — pick */}
        <section>
          <SectionLabel index="01">Pick a template</SectionLabel>
          <div className="mt-4 flex flex-wrap gap-2">
            {props.presets.map((p) => (
              <form key={p.id} action={pickTemplateAction}>
                <input type="hidden" name="roleId" value={props.roleId} />
                <input type="hidden" name="presetId" value={p.id} />
                <button
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs transition ${
                    props.activePresetId === p.id
                      ? "border-ink bg-ink font-medium text-bg"
                      : "border-line-strong hover:bg-cream"
                  }`}
                >
                  {props.activePresetId === p.id && <Check className="size-3.5" />}
                  {p.name}
                </button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">
            Picking a template keeps your role and pay; layout is locked.
          </p>
        </section>

        {/* Level 2 — edit text slots */}
        <section>
          <SectionLabel index="02">Edit text</SectionLabel>
          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="roleId" value={props.roleId} />
            {(["headline", "roleLabel", "payLabel", "cta"] as const).map((key) => (
              <label key={key} className="block">
                <span className="t-label">
                  {key === "roleLabel" ? "Role" : key === "payLabel" ? "Pay" : key}
                </span>
                <input
                  name={key}
                  value={slots[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className={inputClass}
                />
              </label>
            ))}
            <button
              disabled={pending}
              className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save text"}
            </button>

            {/* Validation feedback */}
            {state.violations.length > 0 && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4">
                <p className="text-sm font-medium text-red-200">
                  This can&apos;t be saved yet — fix the following:
                </p>
                <ul className="mt-1 space-y-1 text-sm text-red-300">
                  {state.violations.map((v, i) => (
                    <li key={i}>
                      <span className="font-medium capitalize">{v.field}</span> — {v.reason}{" "}
                      <span className="text-red-400">(found: “{v.match}”)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {state.ok && state.message && (
              <p className="text-sm text-ink">{state.message}</p>
            )}
            {!state.ok && state.message && (
              <p className="text-sm text-red-300">{state.message}</p>
            )}
          </form>
        </section>

        {/* Level 3 — photo swap */}
        <section>
          <SectionLabel index="03">Photo</SectionLabel>
          <div className="mt-4 space-y-3">
            <form action={swapPhotoAction} className="flex items-center gap-2">
              <input type="hidden" name="roleId" value={props.roleId} />
              <input type="hidden" name="mode" value="upload" />
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="text-xs file:mr-2 file:rounded-full file:border file:border-line-strong file:bg-card file:px-3 file:py-1.5"
              />
              <button className="rounded-full border border-line-strong px-4 py-1.5 text-xs hover:bg-cream">
                Upload into frame
              </button>
            </form>
            <form action={swapPhotoAction}>
              <input type="hidden" name="roleId" value={props.roleId} />
              <input type="hidden" name="mode" value="template" />
              <input type="hidden" name="templatePhotoRef" value={props.templatePhotoRef} />
              <button className="rounded-full border border-line-strong px-4 py-1.5 text-xs hover:bg-cream">
                Use template image
              </button>
            </form>
            <p className="text-xs text-faint">
              The photo swaps inside a fixed frame — size and position are locked.
            </p>
          </div>
        </section>
      </div>

      {/* ---------------- Locked preview (kept calm — it's the rendered post) ---------------- */}
      <div>
        <SectionLabel>Preview · locked layout</SectionLabel>
        <div className="mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-2xl border border-line-strong shadow-[0_30px_60px_-40px_rgba(0,0,0,.3)]">
          {/* Fixed photo frame */}
          <div className="flex h-56 w-full items-center justify-center bg-cream">
            {isUploaded ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.photoRef} alt="hiring post" className="h-full w-full object-cover" />
            ) : (
              <span className="px-4 text-center text-xs text-faint">
                Template image
                <br />
                {props.photoRef}
              </span>
            )}
          </div>
          {/* Fixed text block */}
          <div className="space-y-2 bg-card p-6 text-center">
            <p className="font-display text-2xl font-medium">{slots.headline || "Headline"}</p>
            <p className="text-base font-medium">{slots.roleLabel || "Role"}</p>
            <p className="text-sm text-ink-soft">{slots.payLabel || "Pay"}</p>
            <p className="pt-2 text-sm font-medium text-accent">{slots.cta || "Tap to apply"}</p>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-faint">
          No move / resize / restyle / font / color controls — by design.
        </p>
      </div>
    </div>
  );
}
