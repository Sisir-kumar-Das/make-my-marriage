import { getPlanningSession } from '@/features/auth/workspace-gate';
import { SessionRestore } from '@/features/auth/session-provider';
import { WeddingLifecycle } from '@/features/weddings/wedding-lifecycle';
export const metadata = { title: 'Wedding workspace lifecycle' };
export default async function LifecyclePage() {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore embedded />;
  return <WeddingLifecycle />;
}
