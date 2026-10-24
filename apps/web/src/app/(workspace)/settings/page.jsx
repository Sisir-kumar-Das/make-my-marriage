import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { SettingsPreview } from '@/features/dashboard/planning-previews';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <SettingsPreview session={session} />;
}
