"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "../login/actions";
import { SectionLabel } from "../../components/SectionLabel";

// Persistent workspace header shared by /dashboard and /dashboard/creative, so the
// two routes read as two views of ONE workspace. Tabs navigate between the existing
// routes (no merge). On-system: ink, an underline marks the active tab — no blue.
export function WorkspaceHeader({
  operatorId,
  name,
}: {
  operatorId: string;
  name: string;
}) {
  const pathname = usePathname();
  const onCreative = pathname.startsWith("/dashboard/creative");

  const tabs = [
    { label: "Dashboard", href: `/dashboard?operator=${operatorId}`, active: !onCreative },
    { label: "Hiring post", href: `/dashboard/creative?operator=${operatorId}`, active: onCreative },
  ];

  return (
    <header>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Operator workspace</SectionLabel>
          <h1 className="t-title mt-4">{name}</h1>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 rounded-full border border-line-strong px-4 py-1.5 text-sm text-ink-soft transition hover:bg-cream hover:text-ink"
          >
            Log out
          </button>
        </form>
      </div>
      <nav className="mt-7 flex gap-7 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-3 text-sm font-medium transition duration-150 ${
              t.active
                ? "border-ink text-ink"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
