'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionRestore({ embedded = false }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest('/auth/session')
      .then(() => {
        if (active) router.refresh();
      })
      .catch((failure) => {
        if (!active) return;
        if (failure.code === 'SESSION_EXPIRED') {
          router.replace('/login');
          router.refresh();
        } else setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [router, attempt]);
  return (
    <SessionNotice
      embedded={embedded}
      error={error}
      onRetry={() => {
        setError('');
        setAttempt((value) => value + 1);
      }}
    />
  );
}

export function SessionNotice({ error, onRetry, embedded = false }) {
  const Container = embedded ? 'section' : 'main';
  return (
    <Container
      id={embedded ? undefined : 'main-content'}
      className={`flex ${embedded ? 'min-h-[50vh]' : 'min-h-screen'} items-center justify-center bg-[#FBF7F2] px-5 text-[#242124]`}
    >
      <section className="w-full max-w-md rounded-2xl border border-[#E7DED7] bg-[#FFFDFC] p-8 text-center">
        <h1 className="font-serif text-2xl">
          {error
            ? 'We could not check your session.'
            : 'Checking your session…'}
        </h1>
        <p
          role={error ? 'alert' : 'status'}
          className="mt-4 text-sm text-[#5C5457]"
        >
          {error || 'Please wait while we securely restore your sign-in.'}
        </p>
        {error && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 rounded-full bg-[#6E334E] px-6 py-3 text-sm font-semibold text-white"
          >
            Retry session check
          </button>
        )}
      </section>
    </Container>
  );
}

export function SessionProvider({
  initialSession,
  children,
  preserveSetupState = false,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revoked = useRef(false);
  const contextKey = useRef(
    JSON.stringify([initialSession.wedding, initialSession.membership]),
  );
  useEffect(() => {
    let active = true;
    const leave = () => {
      if (!active) return;
      revoked.current = true;
      setSession(null);
      router.replace('/login');
      router.refresh();
    };
    async function check() {
      if (revoked.current || document.visibilityState === 'hidden') return;
      try {
        const result = await apiRequest('/auth/session');
        if (active && !revoked.current) {
          setSession(result.data);
          setError('');
          const key = JSON.stringify([
            result.data.wedding,
            result.data.membership,
          ]);
          if (contextKey.current !== key) {
            contextKey.current = key;
            // Recheck server-rendered content when membership/permissions change.
            if (pathname !== '/wedding-setup') router.refresh();
          }
          if (!result.data.wedding && pathname !== '/wedding-setup') {
            router.replace('/wedding-setup');
            router.refresh();
          }
        }
      } catch (failure) {
        if (!active || revoked.current) return;
        if (failure.code === 'SESSION_EXPIRED') leave();
        else setError(failure.message);
      }
    }
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('mmm-session')
        : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === 'logout') leave();
      };
    const timer = setInterval(check, 60000);
    void check();
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('mmm:session-expired', leave);
    return () => {
      active = false;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('mmm:session-expired', leave);
    };
  }, [router, attempt, pathname]);
  async function logout() {
    setPending(true);
    setError('');
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      revoked.current = true;
      setSession(null);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('mmm-session');
        channel.postMessage('logout');
        channel.close();
      }
      router.replace('/login');
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }
  const preserveDraft = preserveSetupState && pathname === '/wedding-setup';
  if (
    !session ||
    (error && !preserveDraft) ||
    (!session.wedding && pathname !== '/wedding-setup')
  )
    return (
      <SessionNotice
        error={error}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  return (
    <SessionContext.Provider
      value={{
        user: session.user,
        wedding: session.wedding,
        membership: session.membership,
        logout,
        pending,
      }}
    >
      {preserveDraft ? (
        <>
          {error && (
            <section
              role="alert"
              aria-labelledby="setup-connection-heading"
              className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-5 py-5 text-[#242124] shadow-sm"
            >
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 id="setup-connection-heading" className="font-semibold">
                    We could not check your session.
                  </h2>
                  <p className="mt-1 text-sm">
                    Your unsaved wedding details are kept in this tab. Reconnect
                    and retry to continue.
                  </p>
                  <p className="mt-1 text-sm text-[#5C5457]">{error}</p>
                </div>
                <button
                  type="button"
                  className="min-h-11 rounded border border-[#6E334E] px-4 text-sm font-medium text-[#6E334E]"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Retry session check
                </button>
              </div>
            </section>
          )}
          {/* Keep the same subtree mounted while preventing interaction until revalidation. */}
          <div
            inert={error ? true : undefined}
            className={error ? 'opacity-60' : undefined}
          >
            {children}
          </div>
        </>
      ) : (
        children
      )}
    </SessionContext.Provider>
  );
}

export function LogoutButton() {
  const { logout, pending } = useSession();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={logout}
      className="min-h-11 rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Log out'}
    </button>
  );
}
