import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSetupSummary } from "../../../lib/setupCheck";
import { requireSetupAdmin } from "../auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Setup checker · AFRA", robots: { index: false, follow: false } };

// Every client who has at least started checkout, newest first, with how many
// setup checks are green. Open one for the full checklist.
export default async function SetupListPage() {
  await requireSetupAdmin("/admin/setup");
  const operators = await prisma.operator.findMany({
    where: { billingStatus: { not: "none" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true },
  });
  const summaries = (await Promise.all(operators.map((o) => getSetupSummary(prisma, o.id)))).filter(
    (s): s is NonNullable<typeof s> => s !== null,
  );

  return (
    <main className="mx-auto max-w-[760px] px-6 py-10 text-ink">
      <h1 className="t-title mb-6">Setup checker</h1>
      {summaries.length === 0 ? (
        <p className="text-ink-soft">No clients yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {summaries.map((s) => {
            const auto = s.checks.filter((c) => c.state !== "manual");
            const passed = auto.filter((c) => c.state === "pass").length;
            return (
              <li key={s.operatorId}>
                <Link href={`/admin/setup/${s.operatorId}`} className="flex items-center gap-4 px-4 py-4 hover:bg-card">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.businessName}</span>
                    <span className="block truncate text-[13.5px] text-ink-soft">
                      {s.email} · {s.billingStatus}
                      {s.sourceAe ? ` · ${s.sourceAe}` : ""}
                    </span>
                  </span>
                  <span
                    className={`flex-none rounded-full px-3 py-1 text-[13px] font-medium ${
                      s.readyToGoLive ? "bg-ink text-cream" : "border border-line-strong"
                    }`}
                  >
                    {s.readyToGoLive ? "Ready" : `${passed}/${auto.length}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
