import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { ProfilePreview } from '@/features/dashboard/planning-previews';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <ProfilePreview session={session} />;
}
