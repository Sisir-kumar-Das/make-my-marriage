import { redirect } from 'next/navigation';
import { getWorkspaceSession } from '@/features/auth/workspace-gate';
import {
  SessionProvider,
  SessionRestore,
} from '@/features/auth/session-provider';
import { WeddingSetup } from '@/features/weddings/wedding-setup';

export const metadata = {
  title: 'Wedding setup',
  robots: { index: false, follow: false },
};

export default async function WeddingSetupPage() {
  const session = await getWorkspaceSession();
  if (!session) return <SessionRestore />;
  if (session.wedding) redirect('/dashboard');
  return (
    <SessionProvider initialSession={session} preserveSetupState>
      <WeddingSetup />
    </SessionProvider>
  );
}
