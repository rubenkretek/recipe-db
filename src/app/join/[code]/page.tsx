import Link from "next/link";

import { AcceptInviteButton } from "@/components/kitchens/accept-invite-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUserId } from "@/lib/auth";
import { redeemInviteSchema } from "@/schemas/kitchen";

/**
 * Invite landing page. SPEC.md §7.
 *
 * Public, because the person following the link may not have an account yet.
 * The kitchen's name is deliberately not shown: invites are readable only by
 * members, and looking one up for a stranger would leak which codes are live.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const parsed = redeemInviteSchema.safeParse({ code });
  const userId = await getCurrentUserId();

  if (!parsed.success) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-xl">That link looks wrong</CardTitle>
          <CardDescription>
            Invite codes are 8 characters. Check the link you were sent, or ask
            for a fresh one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" asChild className="w-full">
            <Link href="/">Go to the app</Link>
          </Button>
        </CardContent>
      </Shell>
    );
  }

  const normalisedCode = parsed.data.code;
  const nextPath = `/join/${normalisedCode}`;

  if (!userId) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-xl">You have been invited</CardTitle>
          <CardDescription>
            Sign in or create an account, and you will come straight back here
            to join.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild>
            <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>
              Create an account
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
              I already have one
            </Link>
          </Button>
        </CardContent>
      </Shell>
    );
  }

  return (
    <Shell>
      <CardHeader>
        <CardTitle className="text-xl">Join this kitchen?</CardTitle>
        <CardDescription>
          You will be able to see and edit its recipes, plans and shopping list.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteButton code={normalisedCode} />
      </CardContent>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">{children}</Card>
    </main>
  );
}
