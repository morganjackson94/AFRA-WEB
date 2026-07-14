import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  invalid: "That login link isn't valid. Request a new one below.",
  expired: "That login link expired. Request a new one below.",
  used: "That login link was already used. Request a new one below.",
  missing: "That login link is missing its token. Request a new one below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const linkError = error ? (ERROR_COPY[error] ?? ERROR_COPY.invalid) : undefined;
  return <LoginForm linkError={linkError} />;
}
