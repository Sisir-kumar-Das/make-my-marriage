import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { MyProfile } from '@/features/profile/profile-page';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <MyProfile accountId={session.user.id} />;
}
