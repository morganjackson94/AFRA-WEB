import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/prisma";
import { getSetupSummary, type CheckState } from "../../../../lib/setupCheck";
import { requireSetupAdmin } from "../../auth";
import { AutoRefresh } from "../AutoRefresh";
import { CopyButton } from "../CopyButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Client setup · AFRA", robots: { index: false, follow: false } };

const MARK: Record<CheckState, { text: string; cls: string; sr: string }> = {
  pass: { text: "✓", cls: "bg-ink text-cream", sr: "Done" },
  fail: { text: "!", cls: "border-2 border-rose text-rose", sr: "Not done" },
  manual: { text: "?", cls: "border-2 border-line-strong text-ink-soft", sr: "Check by hand" },
};

export default async function SetupDetailPage({ params }: { params: Promise<{ operatorId: string }> }) {
  const { operatorId } = await params;
  await requireSetupAdmin(`/admin/setup/${operatorId}`);
  const s = await getSetupSummary(prisma, operatorId);
  if (!s) notFound();

  const blanks = `${s.manychatBlanks.businessName}\n${s.manychatBlanks.bookingLink}\n${s.manychatBlanks.locationId}`;

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 text-ink">
      <AutoRefresh active={!s.readyToGoLive} />
      <Link href="/admin/setup" className="text-[14px] text-ink-soft underline underline-offset-4">
        All clients
      </Link>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="t-title">{s.businessName}</h1>
        <span
          className={`rounded-full px-4 py-1.5 text-[14px] font-medium ${
            s.readyToGoLive ? "bg-ink text-cream" : "border-2 border-rose text-rose"
          }`}
        >
          {s.readyToGoLive ? "Ready to go live" : "Not ready yet"}
        </span>
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">
        {s.email}
        {s.handle ? ` · ${s.handle}` : ""}
        {s.sourceAe ? ` · closed by ${s.sourceAe}` : ""}
      </p>

      <section aria-labelledby="checks" className="mt-8">
        <h2 id="checks" className="t-label mb-3">
          Checks {s.readyToGoLive ? "" : "(this page re-checks every 5 seconds)"}
        </h2>
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {s.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-4 px-4 py-4">
              <span
                className={`grid size-8 flex-none place-items-center rounded-full text-[15px] font-semibold ${MARK[c.state].cls}`}
                aria-hidden="true"
              >
                {MARK[c.state].text}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">
                  <span className="sr-only">{MARK[c.state].sr}: </span>
                  {c.label}
                </span>
                <span className="block break-words text-[14px] text-ink-soft">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="blanks" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="blanks" className="t-label">
            The 3 blanks in their copy of Master Flow v1
          </h2>
          <CopyButton text={blanks} label="Copy all 3" />
        </div>
        <dl className="divide-y divide-line rounded-2xl border border-line font-mono text-[14px]">
          {(
            [
              ["Business name", s.manychatBlanks.businessName],
              ["Booking link", s.manychatBlanks.bookingLink],
              ["Location ID", s.manychatBlanks.locationId],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 px-4 py-3">
              <dt className="w-32 flex-none font-sans text-ink-soft">{k}</dt>
              <dd className="min-w-0 flex-1 break-all">{v}</dd>
              <CopyButton text={v} />
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="caption" className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="caption" className="t-label">
            Keyword {s.keyword} · caption to text them
          </h2>
          <CopyButton text={s.caption} label="Copy caption" />
        </div>
        <p className="rounded-2xl border border-line px-4 py-4 text-[15px] leading-relaxed">{s.caption}</p>
      </section>

      <section aria-labelledby="details" className="mt-8">
        <h2 id="details" className="t-label mb-3">
          Their answers
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[14.5px]">
          <dt className="text-ink-soft">Locations</dt>
          <dd>
            {s.locationsLabel}
            {s.state ? `, ${s.state}` : ""}
          </dd>
          <dt className="text-ink-soft">Roles</dt>
          <dd>{s.roles.map((r) => (r.pay ? `${r.title} (${r.pay})` : r.title)).join(", ")}</dd>
          <dt className="text-ink-soft">Deal-breakers</dt>
          <dd>{s.dealBreakers.join(", ") || "None"}</dd>
          <dt className="text-ink-soft">Followers</dt>
          <dd>
            {s.followersLabel}
            {s.lowReach ? " (low reach: agree an in-store QR or link-in-bio plan)" : ""}
          </dd>
          <dt className="text-ink-soft">Hires</dt>
          <dd>{s.hiringLabel}</dd>
          <dt className="text-ink-soft">Calendar</dt>
          <dd>{s.calendar ?? "Not picked"}</dd>
          <dt className="text-ink-soft">All location IDs</dt>
          <dd className="break-all font-mono text-[13px]">{s.locations.map((l) => l.id).join(", ")}</dd>
        </dl>
      </section>
    </main>
  );
}
