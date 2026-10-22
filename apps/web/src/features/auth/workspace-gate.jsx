import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { AppShell } from '@/components/layout/app-shell';
import { SessionProvider, SessionRestore } from './session-provider';

export const getWorkspaceSession = cache(async () => {
  const jar = await cookies();
  const access = ['__Host-mmm_access', 'mmm_access']
    .map((name) => {
      const value = jar.get(name)?.value;
      return value ? `${name}=${encodeURIComponent(value)}` : '';
    })
    .filter(Boolean)
    .join('; ');
  if (!access) return null;
  let session;
  try {
    session = await apiRequest('/auth/session', {
      headers: { Cookie: access },
      authRetry: false,
      timeoutMs: 8000,
    });
  } catch {
    // No workspace content is returned until Express authenticates the request.
    // The browser can restore an expired access cookie using its narrowly scoped refresh cookie.
    return null;
  }
  return session.data;
});

export async function getPlanningSession() {
  const session = await getWorkspaceSession();
  if (session && !session.wedding) redirect('/wedding-setup');
  return session;
}

export async function WorkspaceGate({ children }) {
  const session = await getPlanningSession();
  if (!session) return <SessionRestore />;
  return (
    <SessionProvider initialSession={session}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
