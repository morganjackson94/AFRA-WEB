import { prisma } from "../../lib/prisma";

export const dynamic = "force-dynamic";

// Thin landing for the location-scoped hiring link. The real apply flow (the B1
// screening conversation) is post-approval; for now this just proves the link
// carries and resolves location_id for routing.
export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ location_id?: string }>;
}) {
  const { location_id } = await searchParams;
  const location = location_id
    ? await prisma.location.findUnique({
        where: { id: location_id },
        include: { operator: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      {location ? (
        <>
          <h1 className="text-xl font-semibold text-ink">{location.operator.name}</h1>
          <p className="mt-1 text-ink-soft">{location.name}</p>
          <p className="mt-6 text-sm text-faint">
            Applications open here soon. (location_id={location.id})
          </p>
        </>
      ) : (
        <p className="text-sm text-faint">Invalid or missing hiring link.</p>
      )}
    </main>
  );
}
