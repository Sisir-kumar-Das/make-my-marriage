'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AlertDialog } from 'radix-ui';
import {
  AlertTriangle,
  Clock3,
  LogOut,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { newIdempotencyKey } from '@/lib/idempotency-key';
import { useSession } from '@/features/auth/session-provider';
import { PageHeader, SettingsTabs } from '@/features/dashboard/workspace-ui';
import { Brand } from '@/features/home/brand';
import { lifecycleView } from './lifecycle-data';
import { initialLifecycleState, lifecycleReducer } from './lifecycle-state';

const button =
  'min-h-11 rounded-lg px-4 py-2.5 text-sm font-medium leading-[1.25] tracking-[0.01em] disabled:opacity-50';
const indiaTimestamp = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value)) + ' IST';
function announce() {
  const channel =
    typeof BroadcastChannel !== 'undefined' &&
    new BroadcastChannel('mmm-session');
  if (channel) {
    channel.postMessage('wedding-changed');
    channel.close();
  }
}
function waitForResult(ms, signal) {
  if (!ms || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
function rateLimitMessage(retryAfterSeconds, retrying) {
  const outcome = retrying
    ? 'The earlier request is still unconfirmed.'
    : 'This request was blocked before it could start.';
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0)
    return `${outcome} Too many attempts. Please wait before trying again.`;

  const seconds = Math.ceil(retryAfterSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const wait = [
    minutes && `${minutes} minute${minutes === 1 ? '' : 's'}`,
    remainder && `${remainder} second${remainder === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' ');
  return `${outcome} Too many attempts. Try again in ${wait}.`;
}
function LifecyclePanel({
  accountId,
  weddingId,
  initial,
  connectionError = '',
  externalError,
  recoveryMode = false,
}) {
  const [flow, reduce] = useReducer(
    lifecycleReducer,
    initial,
    initialLifecycleState,
  );
  const flowRef = useRef(flow);
  const dispatch = useCallback((event) => {
    // Event handlers and late callbacks see transitions before React commits.
    flowRef.current = lifecycleReducer(flowRef.current, event);
    reduce(event);
  }, []);
  const {
    lifecycle,
    error,
    readError,
    feedback,
    open,
    confirmation,
    pending,
    checking,
    loading,
    operation,
    denied,
    navigating,
  } = flow;
  const [clock, setClock] = useState(null);
  const alive = useRef(false),
    busy = useRef(false),
    leaving = useRef(false),
    reading = useRef(null);
  const errorRef = useRef(null),
    dialogError = useRef(null),
    confirmationInput = useRef(null),
    trigger = useRef(null),
    dialog = useRef(null),
    pageHeading = useRef(null),
    resultFocus = useRef(false);
  const sequence = useRef(0);
  const resultAbort = useRef(null);
  const endpoint = `/weddings/${weddingId}/lifecycle`;
  const navigate = useCallback(
    (href) => {
      leaving.current = true;
      busy.current = true;
      sequence.current++;
      dispatch({ type: 'NAVIGATE' });
      try {
        window.location.replace(href);
      } catch {
        leaving.current = false;
        busy.current = false;
        dispatch({ type: 'NAVIGATION_FAILED' });
        resultFocus.current = true;
      }
    },
    [dispatch],
  );

  const reload = useCallback(
    async (explicit = false) => {
      if (busy.current || (reading.current !== null && !explicit)) return;
      const attempt = ++sequence.current;
      reading.current = { attempt, explicit };
      // Only first load / explicit reload blocks controls. Silent refresh must
      // not disable a focused action and drop keyboard focus onto the body.
      dispatch({ type: 'READ_START', explicit });
      try {
        const identity = await apiRequest('/auth/session');
        if (!alive.current || attempt !== sequence.current) return;
        if (identity.data.user.id !== accountId) {
          dispatch({ type: 'DISCARD_SCOPE' });
          navigate('/wedding-recovery');
          return;
        }
        if (recoveryMode && !identity.data.recovery) {
          navigate(identity.data.wedding ? '/dashboard' : '/wedding-setup');
          return;
        }
        const result = await apiRequest(endpoint);
        if (!alive.current || attempt !== sequence.current) return;
        dispatch({
          type: 'READ_OK',
          lifecycle: result.data.lifecycle,
          explicit,
        });
        if (explicit) resultFocus.current = true;
      } catch (failure) {
        if (!alive.current || attempt !== sequence.current) return;
        const accessDenied = [401, 403, 404].includes(failure.status);
        dispatch({
          type: 'READ_FAIL',
          message: failure.message,
          accessDenied,
          explicit,
        });
        if (explicit || accessDenied) resultFocus.current = true;
      } finally {
        if (reading.current?.attempt === attempt) reading.current = null;
        if (alive.current && attempt === sequence.current)
          dispatch({ type: 'READ_END' });
      }
    },
    [accountId, endpoint, recoveryMode, navigate, dispatch],
  );
  useEffect(() => {
    alive.current = true;
    const initialLoad = setTimeout(() => void reload(), 0);
    const requests = sequence;
    const refresh = () => {
      if (!document.hidden) void reload();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    const channel =
      typeof BroadcastChannel !== 'undefined' &&
      new BroadcastChannel('mmm-session');
    if (channel) channel.onmessage = refresh;
    return () => {
      alive.current = false;
      requests.current++;
      resultAbort.current?.abort();
      clearTimeout(initialLoad);
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      if (channel) channel.close();
    };
  }, [reload]);
  useEffect(() => {
    if (!recoveryMode) return;
    const expired = () => {
      dispatch({ type: 'DISCARD_SCOPE' });
      navigate('/login');
    };
    window.addEventListener('mmm:session-expired', expired);
    return () => window.removeEventListener('mmm:session-expired', expired);
  }, [navigate, recoveryMode, dispatch]);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(
      () => setClock({ lifecycle, elapsed: performance.now() - start }),
      1000,
    );
    return () => clearInterval(timer);
  }, [lifecycle]);
  useEffect(() => {
    if (connectionError) {
      if (resultFocus.current && externalError?.current?.isConnected) {
        resultFocus.current = false;
        externalError.current.focus();
      }
    } else if (pending) {
      const target = dialog.current || pageHeading.current;
      target?.focus();
      // The mobile Restore action sits below the heading. Keep the newly
      // focused heading visible even after the pending button loses focus.
      if (target === pageHeading.current)
        target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    } else if (resultFocus.current) {
      // While the dialog is open, feedback must remain inside its focus scope.
      const target = open
        ? dialogError.current || dialog.current
        : connectionError
          ? externalError?.current
          : errorRef.current;
      if (target?.isConnected && !target.closest('[inert]')) {
        resultFocus.current = false;
        target.focus();
      }
    }
  }, [
    pending,
    open,
    error,
    readError,
    feedback,
    loading,
    lifecycle,
    connectionError,
    externalError,
  ]);
  async function confirmResult(op, attempt, signal) {
    dispatch({ type: 'RESULT_START' });
    const fresh = () =>
      alive.current &&
      !leaving.current &&
      sequence.current === attempt &&
      !signal.aborted;
    for (const delay of [0, 1500, 3500]) {
      await waitForResult(delay, signal);
      if (!fresh()) return;
      try {
        const result = await apiRequest(`${endpoint}/result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': '"' + op.version + '"',
            'Idempotency-Key': op.key,
          },
          body: JSON.stringify({ action: op.action, body: op.body }),
          signal,
          timeoutMs: 5000,
        });
        if (!fresh()) return;
        if (
          result.data?.confirmed === true &&
          result.data.lifecycle?.id === weddingId &&
          ['ACTIVE', 'RECOVERABLE', 'EXPIRED', 'PURGING'].includes(
            result.data.lifecycle.state,
          )
        ) {
          announce();
          navigate(
            result.data.lifecycle.state === 'ACTIVE'
              ? '/dashboard'
              : '/wedding-recovery',
          );
          return;
        }
        if (result.data?.confirmed !== false) break;
      } catch (failure) {
        if (!fresh()) return;
        const accessLost =
          (failure.status === 401 && failure.code === 'SESSION_EXPIRED') ||
          (failure.status === 403 &&
            ['ADMIN_REQUIRED', 'EMAIL_NOT_VERIFIED'].includes(failure.code)) ||
          (failure.status === 404 && failure.code === 'WEDDING_NOT_FOUND');
        if (accessLost) {
          dispatch({
            type: 'READ_FAIL',
            message: failure.message,
            accessDenied: true,
          });
          resultFocus.current = true;
          return;
        }
        // A failed result read says nothing about whether the write committed.
        break;
      }
    }
    if (fresh()) {
      dispatch({
        type: 'SAVE_FAIL',
        definitive: false,
        message: `We could not confirm the ${op.action === 'DELETE' ? 'deletion' : 'restoration'} result yet. It may still complete. Retry the unchanged request.`,
      });
      resultFocus.current = true;
    }
  }
  async function save(action) {
    if (
      busy.current ||
      flowRef.current.denied ||
      connectionError ||
      loading ||
      reading.current?.explicit
    )
      return;
    const current = flowRef.current;
    const op = current.operation || {
      action,
      key: newIdempotencyKey(),
      version: current.lifecycle.version,
      body: action === 'DELETE' ? { confirmation: current.confirmation } : {},
    };
    if (op.action !== action) return;
    dispatch({ type: 'SAVE_START', operation: op });
    const attempt = ++sequence.current;
    const controller = new AbortController();
    resultAbort.current = controller;
    const fresh = () =>
      alive.current && !leaving.current && sequence.current === attempt;
    busy.current = true;
    try {
      const identity = await apiRequest('/auth/session');
      if (!fresh()) return;
      if (identity.data.user.id !== accountId) {
        dispatch({ type: 'DISCARD_SCOPE' });
        navigate('/wedding-recovery');
        return;
      }
      const result = await apiRequest(
        `/weddings/${weddingId}${op.action === 'RESTORE' ? '/restore' : ''}`,
        {
          method: op.action === 'DELETE' ? 'DELETE' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': '"' + op.version + '"',
            'Idempotency-Key': op.key,
          },
          body: JSON.stringify(op.body),
          timeoutMs: 15000,
        },
      );
      if (!fresh()) return;
      announce();
      navigate(
        result.data.lifecycle.state === 'ACTIVE'
          ? '/dashboard'
          : '/wedding-recovery',
      );
    } catch (failure) {
      if (!fresh()) return;
      if (failure.status === 429 && failure.code === 'RATE_LIMITED') {
        dispatch({
          type: 'SAVE_FAIL',
          message: rateLimitMessage(
            failure.retryAfterSeconds,
            !!current.operation,
          ),
          // A blocked retry cannot settle an earlier uncertain request.
          clearOperation: !current.operation,
        });
        resultFocus.current = true;
      } else if ([400, 401, 403, 404, 409, 410, 428].includes(failure.status)) {
        dispatch({
          type: 'SAVE_FAIL',
          message: failure.message,
          definitive: true,
        });
        resultFocus.current = true;
      } else await confirmResult(op, attempt, controller.signal);
    } finally {
      if (fresh()) {
        busy.current = false;
        dispatch({ type: 'SAVE_END' });
      }
    }
  }
  const { active, remaining, canRestore, expired } = lifecycleView(
    lifecycle,
    clock && clock.lifecycle === lifecycle ? clock.elapsed : 0,
  );
  const locked =
    pending || navigating || !!connectionError || loading || denied;
  const checkingMessage = checking
    ? `Checking ${operation?.action === 'DELETE' ? 'deletion' : 'restoration'} result…`
    : '';
  const issue = readError?.accessDenied
    ? readError.message
    : error || readError?.message;
  const dialogMessage = readError?.accessDenied ? readError.message : error;
  const recoveryActions = (
    <div
      className={`flex flex-wrap gap-3 ${active ? 'justify-end' : 'justify-center'}`}
    >
      <button
        type="button"
        className={`${button} border border-[#d9c0cb]`}
        disabled={pending || navigating || !!connectionError || loading}
        onClick={() => void reload(true)}
      >
        Reload current state
      </button>
      {operation && !open && (
        <button
          type="button"
          className={`${button} bg-[#531d37] text-white`}
          disabled={locked}
          onClick={() => void save(operation.action)}
        >
          Retry unchanged{' '}
          {operation.action === 'DELETE' ? 'deletion' : 'restoration'}
        </button>
      )}
    </div>
  );
  return (
    <>
      {(issue || feedback || checkingMessage) && !open && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role={checking ? 'status' : issue ? 'alert' : 'status'}
          className="mb-4 rounded-lg border bg-[#f9f2f6] p-4 text-sm text-[#531d37]"
        >
          {checkingMessage || issue || feedback}
        </div>
      )}
      {!lifecycle && (
        <p role="status">
          {loading
            ? 'Loading recovery information…'
            : 'Wedding recovery information is unavailable. Reload to check your current access.'}
        </p>
      )}
      {lifecycle &&
        (active ? (
          <section className="flex flex-col gap-4 rounded-lg bg-[#ffdad6]/30 p-6 shadow-sm">
            <h2
              ref={pageHeading}
              tabIndex={-1}
              className="flex items-center gap-2 text-xl font-semibold leading-[1.4] tracking-[-0.01em] text-[#ba1a1a]"
            >
              <Trash2 aria-hidden="true" size={24} className="shrink-0" />
              Delete Wedding Workspace
            </h2>
            <p className="max-w-3xl text-[15px] leading-[1.5]">
              Your planning workspace will become unavailable. You can restore
              it within <strong>7 days</strong>. After that, it may be
              permanently deleted.
            </p>
            <div className="flex flex-col justify-between gap-4 pt-1 sm:flex-row sm:items-center">
              <p className="flex items-center gap-1 text-xs text-[#514348]">
                <ShieldCheck
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-[#3d2e0d]"
                />
                <span>
                  Any authorized workspace Admin can initiate or cancel wedding
                  deletion and perform restoration.
                </span>
              </p>
              {lifecycle.canDelete ? (
                <button
                  ref={trigger}
                  type="button"
                  className={`${button} flex shrink-0 items-center justify-center gap-2 !px-6 bg-white text-[#ba1a1a] shadow-sm`}
                  disabled={locked || !!operation}
                  onClick={() => {
                    dispatch({ type: 'OPEN' });
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" className="shrink-0" />
                  <span>Delete Wedding Workspace</span>
                </button>
              ) : (
                <p className="text-sm font-semibold">Admin only</p>
              )}
            </div>
            {recoveryActions}
          </section>
        ) : (
          <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 overflow-hidden rounded-lg bg-white p-10 text-center shadow-md">
            <span className="grid size-16 place-items-center rounded-full bg-[#ffdad6] text-[#ba1a1a]">
              <AlertTriangle size={32} aria-hidden="true" />
            </span>
            <span className="rounded-full bg-[#ffd5dd] px-4 py-1 text-xs font-semibold uppercase tracking-wide">
              {expired
                ? 'Recovery Window Expired'
                : 'Pending Deletion · 7-Day Window Active'}
            </span>
            <h1
              ref={pageHeading}
              tabIndex={-1}
              className="max-w-full break-words font-serif text-4xl font-semibold leading-[1.25] tracking-[-0.01em] text-[#531d37]"
            >
              {lifecycle.name}{' '}
              {expired ? 'cannot be restored' : 'is scheduled for deletion'}
            </h1>
            <p className="max-w-lg text-[15px] leading-[1.5] text-[#514348]">
              {expired
                ? 'The recovery deadline has elapsed. Permanent cleanup is pending or in progress; expiry alone does not mean records have already been erased.'
                : 'This workspace was scheduled for deletion. Access for collaborators is paused. Any authorized workspace Admin can perform restoration.'}
            </p>
            <div className="my-2 w-full max-w-md rounded-lg bg-[#f9f2f6] p-4 text-sm">
              <p className="flex items-center justify-center gap-2 text-base font-semibold leading-[1.4] tracking-[-0.01em] text-[#ba1a1a]">
                <Clock3 size={20} aria-hidden="true" className="shrink-0" />
                <span>
                  Recovery Window: Until {indiaTimestamp(lifecycle.purgeAfter)}
                </span>
              </p>
              {!expired && (
                <p className="mt-1 text-xs">
                  Remaining:{' '}
                  <strong>
                    {remaining === null
                      ? 'See the recovery deadline above'
                      : remaining === 0
                        ? 'Checking current recovery status'
                        : `${Math.floor(remaining / 86400000)} days, ${Math.floor(remaining / 3600000) % 24} hours`}
                  </strong>
                </p>
              )}
            </div>
            {canRestore && (
              <button
                type="button"
                className={`${button} flex w-full items-center justify-center gap-2 !px-10 !py-3 bg-[#531d37] text-white sm:w-auto`}
                disabled={locked || !!operation}
                onClick={() => void save('RESTORE')}
              >
                <RotateCcw size={20} aria-hidden="true" className="shrink-0" />
                <span>Restore Wedding Workspace</span>
              </button>
            )}
            {!lifecycle.canRestore && !expired && (
              <p className="text-sm font-semibold">
                An Admin can restore this wedding.
              </p>
            )}
            <p className="text-xs text-[#514348]">
              Your account remains available. Memberships stay reserved until
              restoration or permanent cleanup completes.
            </p>
            {recoveryActions}
          </section>
        ))}
      {!lifecycle && recoveryActions}
      <AlertDialog.Root
        open={open && !connectionError}
        onOpenChange={(value) => {
          if (!connectionError && !value) dispatch({ type: 'CLOSE' });
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            onPointerDown={(event) => {
              if (pending || operation || navigating) {
                event.preventDefault();
                dialog.current?.focus();
              }
            }}
            className="fixed inset-0 z-[70] bg-[#211a1d]/40 backdrop-blur-[2px]"
          />
          <AlertDialog.Content
            ref={dialog}
            tabIndex={-1}
            aria-busy={pending}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (pending || operation
                ? dialogError.current || dialog.current
                : confirmationInput.current || dialog.current
              )?.focus();
            }}
            className="fixed left-1/2 top-1/2 z-[71] flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onEscapeKeyDown={(event) => {
              if (pending || operation) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const target = connectionError
                ? externalError?.current
                : pending || navigating
                  ? pageHeading.current
                  : error || denied
                    ? errorRef.current
                    : trigger.current;
              if (
                target?.isConnected &&
                !target.disabled &&
                !target.closest('[inert]')
              )
                target.focus();
            }}
          >
            <div className="flex items-center justify-between gap-3 text-[#ba1a1a]">
              <AlertDialog.Title className="flex items-center gap-2 text-xl font-semibold leading-[1.4] tracking-[-0.01em]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#ffdad6] text-[#93000a]">
                  <AlertTriangle aria-hidden="true" size={18} />
                </span>
                Confirm 7-Day Soft Deletion
              </AlertDialog.Title>
              <button
                type="button"
                aria-label="Close confirmation"
                disabled={pending || !!operation}
                onClick={() => dispatch({ type: 'CLOSE' })}
              >
                <X size={20} />
              </button>
            </div>
            <AlertDialog.Description className="text-[15px] leading-[1.5]">
              Your planning workspace will become unavailable. Any authorized
              Admin can restore it within seven days of confirmation, until the
              exact deadline.
            </AlertDialog.Description>
            <p className="rounded-lg bg-[#f9f2f6] p-3 text-xs">
              No immediate data wipe. Existing members retain their roles.
              Pending invitations will be cancelled; send fresh invitations
              after restoring. Login accounts and personal profile photos are
              kept.
            </p>
            <label
              className="text-sm font-medium leading-[1.25] tracking-[0.01em]"
              htmlFor="wedding-delete-confirm"
            >
              Type <strong className="text-[#ba1a1a]">DELETE</strong> to
              authorize:
            </label>
            <input
              ref={confirmationInput}
              id="wedding-delete-confirm"
              value={confirmation}
              onChange={(event) =>
                dispatch({ type: 'INPUT', value: event.target.value })
              }
              disabled={pending || !!operation}
              autoComplete="off"
              placeholder="DELETE"
              className="min-h-11 rounded-lg border px-4 py-2 text-[15px] leading-[1.5] focus:outline-none focus:ring-2 focus:ring-[#ba1a1a]"
            />
            {(dialogMessage || checkingMessage) && (
              <p
                ref={dialogError}
                tabIndex={-1}
                role={checking ? 'status' : 'alert'}
                className="text-sm text-[#ba1a1a]"
              >
                {checkingMessage || dialogMessage}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className={button}
                  disabled={pending || !!operation}
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className={`${button} bg-[#ba1a1a] text-white`}
                disabled={locked || confirmation !== 'DELETE'}
                onClick={() => void save('DELETE')}
              >
                {pending
                  ? 'Please wait…'
                  : operation
                    ? 'Retry unchanged deletion'
                    : 'Deactivate Workspace'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

export function WeddingLifecycle() {
  const session = useSession();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Workspace & Account"
        title="Settings & Workspace Management"
        description="Your wedding identity, location, traditions and workspace preferences."
      >
        <span className="rounded-full bg-[#ffdfa3] px-2 py-1 text-xs font-semibold">
          Workspace Role:{' '}
          {session.membership.role === 'ADMIN'
            ? 'Admin'
            : session.membership.role === 'FAMILY_MEMBER'
              ? 'Family Member'
              : 'Viewer'}
        </span>
      </PageHeader>
      <SettingsTabs active="/settings/lifecycle" />
      <LifecyclePanel
        key={`${session.user.id}/${session.wedding.id}/${session.membership.role}`}
        accountId={session.user.id}
        weddingId={session.wedding.id}
        connectionError={session.connectionError}
        externalError={session.connectionErrorFocus}
      />
    </div>
  );
}
export function WeddingRecovery({ session }) {
  const [error, setError] = useState('');
  return (
    <main className="min-h-screen bg-[#fff7fb] p-4 text-[#211a1d] sm:p-8">
      <header className="mx-auto mb-8 flex max-w-6xl items-center justify-between gap-4">
        <Brand href="/" className="!w-36 sm:!w-56" />
        <button
          type="button"
          className={`${button} flex items-center gap-2 border bg-white`}
          onClick={async () => {
            try {
              await apiRequest('/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              });
              announce();
              window.location.replace('/login');
            } catch (failure) {
              // apiRequest broadcasts expiry; the mounted recovery panel owns
              // the single login replacement, including an expired logout.
              if (failure.code !== 'SESSION_EXPIRED') setError(failure.message);
            }
          }}
        >
          <LogOut size={18} aria-hidden="true" />
          Log out
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <LifecyclePanel
        key={`${session.user.id}/${session.recovery.id}`}
        accountId={session.user.id}
        weddingId={session.recovery.id}
        initial={session.recovery}
        recoveryMode
      />
    </main>
  );
}
