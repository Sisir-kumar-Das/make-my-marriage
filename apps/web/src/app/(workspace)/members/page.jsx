import { SessionRestore } from '@/features/auth/session-provider';
import { getPlanningSession } from '@/features/auth/workspace-gate';
import { MembersPage as MemberDirectory } from '@/features/members/members-page';

export const metadata = { title: 'Members' };

export default async function MembersPage({ searchParams }) {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  const params = await searchParams;
  return <MemberDirectory inviteShortcut={params.invite === '1'} />;
}
