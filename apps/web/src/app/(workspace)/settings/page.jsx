import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { PlaceholderPage } from '@/components/placeholder-page';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  if (!(await getPlanningSession())) return <SessionRestore embedded />;
  return (
    <PlaceholderPage
      title="Settings"
      description="Wedding setup, wedding details and account settings will be implemented in a later milestone."
    />
  );
}
