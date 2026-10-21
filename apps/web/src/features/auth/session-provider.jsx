'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

export function SessionProvider({ initialSession, children }) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revoked = useRef(false);
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
  }, [router, attempt]);
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
  if (!session || error)
    return (
      <SessionNotice
        error={error}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  return (
    <SessionContext.Provider value={{ user: session.user, logout, pending }}>
      {children}
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
