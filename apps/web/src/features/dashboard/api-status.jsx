'use client';

import { useEffect, useState } from 'react';
import {
  RefreshCw,
  CircleCheck,
  CircleAlert,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';

export function ApiStatus() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      try {
        const result = await apiRequest('/health', {
          signal: controller.signal,
        });
        if (result.data?.status !== 'ok')
          throw new Error('The API health response was unexpected.');
        if (!controller.signal.aborted) setState({ status: 'connected' });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ status: 'unavailable', message: error.message });
      }
    }
    check();
    return () => controller.abort();
  }, [attempt]);

  const Icon =
    state.status === 'checking'
      ? LoaderCircle
      : state.status === 'connected'
        ? CircleCheck
        : CircleAlert;
  const label =
    state.status === 'checking'
      ? 'Checking API…'
      : state.status === 'connected'
        ? 'API connected'
        : 'API unavailable';

  return (
    <aside
      aria-label="API connectivity"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
    >
      <div
        className="flex min-w-0 items-center gap-3"
        role="status"
        aria-live="polite"
      >
        <Icon
          className={`size-4 shrink-0 ${state.status === 'checking' ? 'animate-spin text-muted-foreground' : state.status === 'connected' ? 'text-success' : 'text-warning'}`}
          aria-hidden="true"
        />
        <div>
          <p className="text-xs font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state.message ??
              'Development check: browser → Express health endpoint.'}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={state.status === 'checking'}
        onClick={() => {
          setState({ status: 'checking' });
          setAttempt((value) => value + 1);
        }}
      >
        <RefreshCw className="size-3.5" />
        Retry connection
      </Button>
    </aside>
  );
}
