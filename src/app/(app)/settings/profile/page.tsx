import { DisplayNameForm } from "@/components/settings/display-name-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMyProfile } from "@/lib/auth";

/**
 * Profile settings. SPEC.md §7.
 *
 * Display name only for now. Avatars wait for Phase 3, when Supabase Storage
 * and its kitchen-scoped path policy exist.
 */
export default async function ProfileSettingsPage() {
  const profile = await requireMyProfile();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display name</CardTitle>
          <CardDescription>
            What everyone else in your kitchens sees.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm currentName={profile.display_name} />
        </CardContent>
      </Card>
    </div>
  );
}
