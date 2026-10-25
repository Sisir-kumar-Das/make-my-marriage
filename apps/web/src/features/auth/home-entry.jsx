'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { SessionNotice } from './session-provider';

// A cookie is only a recovery hint. Express alone decides whether this is a session.
export function HomeEntry({ children }) {
  const router = useRouter();
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    apiRequest('/auth/session', { signal: controller.signal, timeoutMs: 8000 })
      .then((result) => {
        if (!active) return;
        router.replace(result.data.wedding ? '/dashboard' : '/wedding-setup');
        router.refresh();
      })
      .catch((failure) => {
        if (!active) return;
        if (failure.code === 'SESSION_EXPIRED') setGuest(true);
        else setError(failure.message);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [router, attempt]);
  if (guest) return children;
  return (
    <SessionNotice
      error={error}
      onRetry={() => {
        setError('');
        setAttempt((value) => value + 1);
      }}
    />
  );
}
