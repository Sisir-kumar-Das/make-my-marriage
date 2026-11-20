import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { WeddingSettings } from '@/features/weddings/wedding-settings';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <WeddingSettings accountId={session.user.id} />;
}
