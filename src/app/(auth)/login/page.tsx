import { LoginForm } from "@/components/auth/login-form";
import { safeRedirectPath } from "@/lib/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={safeRedirectPath(next) ?? undefined} />;
}
