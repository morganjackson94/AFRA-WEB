<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Before running any local script or `npm run dev`

Read `docs/DATABASE.md` first. Local scripts and the dev server require
`DEV_DATABASE_URL` (no fallback to `.env`'s production `DATABASE_URL`) and
refuse to run against a database carrying the `ProductionMarker` row.
<!-- END:nextjs-agent-rules -->
