import Link from "next/link";

import { CreateKitchenForm } from "@/components/kitchens/create-kitchen-form";
import { JoinKitchenForm } from "@/components/kitchens/join-kitchen-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getKitchenContext } from "@/lib/kitchen";

/**
 * Create or join a kitchen.
 *
 * Deliberately outside the app shell, because the shell needs an active kitchen
 * and someone arriving here may not have one yet. It doubles as the empty state
 * for a brand new account and as the "add another" screen. SPEC.md §7.
 */
export default async function KitchensPage() {
  const { kitchens, active } = await getKitchenContext();
  const isFirstKitchen = kitchens.length === 0;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {isFirstKitchen ? "Set up your kitchen" : "Kitchens"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {isFirstKitchen
            ? "A kitchen holds your recipes, plans and shopping list. Make one, or join someone else's with their code."
            : "Create another kitchen, or join one with a code."}
        </p>
      </div>

      {!isFirstKitchen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">You are in</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {kitchens.map((kitchen) => (
              <p key={kitchen.id} className="text-sm">
                {kitchen.name}
                {kitchen.id === active?.id && (
                  <span className="text-muted-foreground"> · active</span>
                )}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a kitchen</CardTitle>
          <CardDescription>You can invite someone afterwards.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateKitchenForm />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs uppercase">or</span>
        <Separator className="flex-1" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Join with a code</CardTitle>
        </CardHeader>
        <CardContent>
          <JoinKitchenForm />
        </CardContent>
      </Card>

      {!isFirstKitchen && (
        <Button variant="ghost" asChild>
          <Link href="/">Back to {active?.name}</Link>
        </Button>
      )}
    </main>
  );
}
