import { PageHeader } from "@/components/shared/page-header";
import { PasswordSettingsCard } from "./password-settings-card";
import { DeleteProfileCard } from "./delete-profile-card";
import { ProfileSettingsCard } from "./profile-settings-card";
import { RecoverySettingsCard } from "./recovery-settings-card";

export function Component() {
  return <div className="space-y-7"><PageHeader eyebrow="Profile" title="Profile settings" description="Update the identity details used in documents and manage the credentials that protect this vault." /><div className="grid items-start gap-5 xl:grid-cols-2"><ProfileSettingsCard /><PasswordSettingsCard /><RecoverySettingsCard /><DeleteProfileCard /></div></div>;
}
