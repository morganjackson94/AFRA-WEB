import Link from "next/link";
import { redirect } from "next/navigation";
import { markCandidateBookedAction } from "../../actions";
import { ArrowLeft } from "../../../../components/Icons";
import { Reveal } from "../../../../components/Reveal";
import { SectionLabel } from "../../../../components/SectionLabel";
import { STAGE_RANK } from "../../../../lib/manychat";
import { prisma } from "../../../../lib/prisma";
import { resolveOperatorId } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  screened: "Screened",
  booked: "Booked",
  showed: "Showed",
  rejected: "Not moving forward",
};

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ operator?: string }>;
}) {
  const { id } = await params;
  const { operator: explicit } = await searchParams;
  const operatorId = await resolveOperatorId(explicit);
  if (!operatorId) redirect("/login");

  // Ownership check via the relation, not a separate lookup — a candidate id
  // that belongs to a DIFFERENT operator must read as not-found, never leak.
  const candidate = await prisma.candidate.findFirst({
    where: { id, location: { operatorId } },
    include: {
      role: true,
      location: true,
      conversations: { orderBy: { updatedAt: "desc" }, take: 1 },
      bookings: { orderBy: { scheduledAt: "desc" }, take: 1 },
    },
  });

  if (!candidate) {
    return (
      <main className="min-h-screen bg-bg px-6 py-12 text-ink">
        <div className="mx-auto max-w-2xl">
          <Link href={`/dashboard?operator=${operatorId}`} className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
          <p className="mt-8 text-sm text-ink-soft">Candidate not found.</p>
        </div>
      </main>
    );
  }

  const conversation = candidate.conversations[0];
  const answers = (conversation?.transcript as { answers?: Record<string, string> } | null)?.answers ?? {};
  const answerEntries = Object.entries(answers);
  const booking = candidate.bookings[0];

  return (
    <main className="min-h-screen bg-bg px-6 py-12 text-ink md:py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/dashboard?operator=${operatorId}`}
          className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>

        <Reveal>
          <div className="mt-7 flex items-start justify-between gap-4">
            <div>
              <h1 className="t-title">{candidate.name ?? candidate.contact ?? "Candidate"}</h1>
              {candidate.contact && candidate.name && (
                <p className="mt-1 text-sm text-ink-soft">{candidate.contact}</p>
              )}
            </div>
            <span className="shrink-0 rounded-full border border-line-strong bg-cream px-3 py-1 text-xs font-semibold text-ink-soft">
              {STAGE_LABEL[candidate.stage] ?? candidate.stage}
            </span>
          </div>
        </Reveal>

        {(STAGE_RANK["booked"] ?? 0) > (STAGE_RANK[candidate.stage] ?? 0) && (
          <Reveal>
            <form action={markCandidateBookedAction} className="mt-5">
              <input type="hidden" name="candidateId" value={candidate.id} />
              <button
                type="submit"
                className="rounded-full border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-cream"
              >
                Mark as booked
              </button>
              <p className="mt-2 text-xs text-faint">
                Once they&apos;ve booked an interview on your calendar or Calendly link.
              </p>
            </form>
          </Reveal>
        )}

        <Reveal>
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-line bg-card p-6">
              <SectionLabel>Applying for</SectionLabel>
              <p className="mt-3 text-sm text-ink">
                {candidate.role?.title ?? "Role not specified"} · {candidate.location.name}
              </p>
              {candidate.availability && (
                <p className="mt-2 text-sm text-ink-soft">Availability: {candidate.availability}</p>
              )}
            </div>

            {booking?.scheduledAt && (
              <div className="rounded-2xl border border-line bg-card p-6">
                <SectionLabel>Interview</SectionLabel>
                <p className="mt-3 text-sm text-ink">
                  {new Date(booking.scheduledAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {booking.status}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-line bg-card p-6">
              <SectionLabel>Screening answers</SectionLabel>
              {answerEntries.length === 0 ? (
                <p className="mt-3 text-sm text-faint">
                  {candidate.stage === "applied"
                    ? "Screening hasn't completed yet."
                    : "No screening answers on file."}
                </p>
              ) : (
                <dl className="mt-3 space-y-3">
                  {answerEntries.map(([question, answer]) => (
                    <div key={question}>
                      <dt className="text-xs uppercase tracking-[0.1em] text-faint">{question}</dt>
                      <dd className="mt-0.5 text-sm text-ink">{answer}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
