import Link from "next/link";

import { InvitePanel } from "@/components/settings/invite-panel";
import { LeaveKitchenButton } from "@/components/settings/leave-kitchen-button";
import { RenameKitchenForm } from "@/components/settings/rename-kitchen-form";
import { SupermarketManager } from "@/components/settings/supermarket-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUserId } from "@/lib/auth";
import { requireKitchenContext } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { listSupermarkets } from "@/lib/supermarkets";

/**
 * Kitchen settings. SPEC.md §7.
 *
 * Phase 1 covers members, invite codes and the name. Supermarkets, tags and
 * ingredients arrive with the phases that introduce them.
 */
export default async function KitchenSettingsPage() {
  const { active } = await requireKitchenContext();
  const userId = await requireUserId();
  const supabase = await createClient();

  // Both queries filter by the active kitchen explicitly, even though RLS would
  // already do it. RLS is the safety net, not the filter. CLAUDE.md.
  const supermarkets = await listSupermarkets();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("kitchen_members")
      .select("user_id, joined_at, profiles (display_name)")
      .eq("kitchen_id", active.id)
      .order("joined_at", { ascending: true }),
    supabase
      .from("kitchen_invites")
      .select("code, expires_at")
      .eq("kitchen_id", active.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const memberRows = members ?? [];
  const liveInvite = invites?.[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Kitchen settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Name</CardTitle>
        </CardHeader>
        <CardContent>
          <RenameKitchenForm kitchenId={active.id} currentName={active.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
          <CardDescription>
            Everyone in a kitchen can do everything. There are no roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {memberRows.map((member) => (
            <p key={member.user_id} className="text-sm">
              {member.profiles?.display_name ?? "Unknown"}
              {member.user_id === userId && (
                <span className="text-muted-foreground"> · you</span>
              )}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite someone</CardTitle>
          <CardDescription>
            Share this code, or the link, with whoever should join. It works for
            7 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitePanel
            kitchenId={active.id}
            code={liveInvite?.code ?? null}
            expiresAt={liveInvite?.expires_at ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supermarkets</CardTitle>
          <CardDescription>
            The shops you buy from. Drag to set the order they appear in when
            you are shopping.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupermarketManager supermarkets={supermarkets} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingredients</CardTitle>
          <CardDescription>
            Rename an ingredient everywhere, or merge duplicates together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" asChild>
            <Link href="/settings/ingredients">Manage ingredients</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveKitchenButton
            kitchenId={active.id}
            kitchenName={active.name}
            isOnlyMember={memberRows.length <= 1}
          />
        </CardContent>
      </Card>
    </div>
  );
}
