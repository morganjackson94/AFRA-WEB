import { redirect } from "next/navigation";
import { currentAe } from "../ae/actions";

/** Team ids (AE_ACCOUNTS keys) allowed into /admin, from SETUP_ADMINS, e.g.
 *  "morgan". Unset means nobody: the setup checker shows every client's
 *  details, so access is opt-in per person, not "anyone who can sign in". */
export function setupAdmins(): string[] {
  return (process.env.SETUP_ADMINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The signed-in admin's id; otherwise sends them to sign in (or 404-style home). */
export async function requireSetupAdmin(nextPath: string): Promise<string> {
  const id = await currentAe();
  if (!id) redirect(`/ae/login?next=${encodeURIComponent(nextPath)}`);
  if (!setupAdmins().includes(id)) redirect("/ae/new");
  return id;
}
