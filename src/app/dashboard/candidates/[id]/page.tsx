import Link from "next/link";
import { redirect } from "next/navigation";
import { markCandidateBookedAction } from "../../actions";
import { ArrowLeft } from "../../../../components/Icons";
import { Reveal } from "../../../../components/Reveal";
import { SectionLabel } from "../../../../components/SectionLabel";
import { STAGE_RANK } from "../../../../lib/manychat";
import { prisma } from "../../../../lib/prisma";
import { buildAssembledQuestions, decodeAnswer, type DecodedAnswer } from "../../../../lib/screeningQuestions";
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
      // include roles so a candidate with no roleId (odd/old data) can still
      // resolve a question set via "the location's single role" (see below).
      location: { include: { roles: true } },
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
  const transcript = conversation?.transcript as
    | { answers?: Record<string, string>; questionSnapshot?: DecodedAnswer[] }
    | null;
  const rawAnswers = transcript?.answers ?? {};
  const snapshot = transcript?.questionSnapshot;
  // roleId first, then the location's single role (matches provision()'s
  // one-role-per-location shape), then screeningQuestions' own generic
  // fallback for anything odder than that.
  const roleTitle = candidate.role?.title ?? candidate.location.roles[0]?.title;

  // Ownership check above already scoped the candidate to this operator, so
  // this is the same operator — fetched separately since it's not on the
  // candidate/location include above. Passed into buildAssembledQuestions()/
  // decodeAnswer() so "disqualifying" reflects this operator's actual
  // configuration, and the question set matches what this candidate was
  // actually asked (universal + selected knockouts + competency).
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { disqualifiers: true },
  });
  const operatorRoles = await prisma.role.findMany({
    where: { location: { operatorId } },
    select: { title: true },
    distinct: ["title"],
  });
  const questionSet = {
    roleTitle: roleTitle ?? "",
    questions: buildAssembledQuestions(roleTitle, operator?.disqualifiers ?? [], operatorRoles.map((r) => r.title)),
  };

  // Snapshot (resolved at ingest time) wins when present so records stay
  // decodable after future question-library edits; otherwise decode live
  // against the current library; unresolvable entries render raw, same as
  // before this feature existed — nothing regresses on old/odd data.
  const displayAnswers = Object.entries(rawAnswers).map(([key, rawAnswer]) => {
    const snapshotted = snapshot?.find((s) => s.key === key);
    const decoded = snapshotted ?? decodeAnswer(questionSet, key, rawAnswer, operator?.disqualifiers);
    if (decoded) {
      return { key, question: decoded.question, answer: decoded.answerLabel, disqualifying: decoded.disqualifying };
    }
    return { key, question: key, answer: rawAnswer, disqualifying: false };
  });
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
              {displayAnswers.length === 0 ? (
                <p className="mt-3 text-sm text-faint">
                  {candidate.stage === "applied"
                    ? "Screening hasn't completed yet."
                    : "No screening answers on file."}
                </p>
              ) : (
                <dl className="mt-3 space-y-3">
                  {displayAnswers.map((a) => (
                    <div key={a.key}>
                      <dt className="text-xs uppercase tracking-[0.1em] text-faint">{a.question}</dt>
                      <dd className="mt-0.5 text-sm text-ink">
                        {a.answer}
                        {a.disqualifying && (
                          <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">
                            screened out
                          </span>
                        )}
                      </dd>
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
