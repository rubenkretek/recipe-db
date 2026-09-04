import { SignupForm } from "@/components/auth/signup-form";
import { safeRedirectPath } from "@/lib/redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <SignupForm next={safeRedirectPath(next) ?? undefined} />;
}
