'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { SessionNotice } from './session-provider';
import { createHomeEntryFlow } from './home-entry-state';

// A cookie is only a recovery hint. Express alone decides whether this is a session.
export function HomeEntry({ children }) {
  const [state, setState] = useState({ phase: 'checking' });
  const flow = useRef(null);
  useEffect(() => {
    const attempt = createHomeEntryFlow({
      checkSession: (signal) =>
        apiRequest('/auth/session', { signal, timeoutMs: 8000 }),
      navigate: (destination) => window.location.replace(destination),
      stopNavigation: () => window.stop(),
      onState: setState,
    });
    flow.current = attempt;
    attempt.start();
    return () => {
      attempt.dispose();
      if (flow.current === attempt) flow.current = null;
    };
  }, []);
  if (state.phase === 'guest') return children;
  const opening = state.phase === 'opening';
  const stalled = state.phase === 'stalled';
  return (
    <SessionNotice
      error={state.phase === 'failed' ? state.message : ''}
      title={
        opening
          ? 'Opening your workspace…'
          : stalled
            ? 'Your workspace is taking longer to open.'
            : undefined
      }
      description={
        opening
          ? 'Your sign-in is restored. We’re opening your workspace.'
          : stalled
            ? state.message ||
              'Your sign-in was restored, but the workspace has not opened yet. Retry or continue below.'
            : undefined
      }
      showRetry={state.phase === 'failed' || stalled}
      retryLabel="Retry"
      onRetry={() => flow.current?.start()}
      continueHref={stalled ? state.destination : undefined}
      continueLabel={
        state.destination === '/wedding-setup'
          ? 'Continue to Wedding Setup'
          : 'Continue to Dashboard'
      }
    />
  );
}
