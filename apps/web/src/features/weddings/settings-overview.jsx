'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  CircleCheck,
  Hourglass,
  Mail,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { weddingToday } from './form-data';

export function settingsCountdown(mainDate, instant = new Date()) {
  const days = Math.round(
    (Date.parse(mainDate) - Date.parse(weddingToday(instant))) / 86400000,
  );
  return days === 0
    ? 'Today'
    : days > 0
      ? `${days} ${days === 1 ? 'Day' : 'Days'}`
      : `${-days} ${days === -1 ? 'day' : 'days'} since`;
}

// The parent keys this component by account/wedding/role. Cleanup rejects late
// responses, including a privileged response arriving after an account change.
export function SettingsOverview({ session }) {
  const { wedding, user, membership } = session;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [tick, setTick] = useState(() => new Date());
  const started = useRef(0);
  const terminal = useRef(false);
  const recheck = useRef(session.retrySession);
  const headingFocus = useRef(null);
  const errorFocus = useRef(null);
  const requestedFocus = useRef(false);
  useEffect(() => {
    recheck.current = session.retrySession;
  }, [session.retrySession]);
  useEffect(() => {
    const controller = new AbortController();
    started.current = Date.now();
    apiRequest(`/weddings/${wedding.id}/overview`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.role !== membership.role) {
          terminal.current = true;
          setResult({
            error:
              'Your access changed. Refresh your session to view current figures.',
            revision,
            terminal: true,
          });
          recheck.current();
          return;
        }
        terminal.current = false;
        setResult({ data, revision });
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        const blocked = [401, 403, 404].includes(failure.status);
        terminal.current = blocked;
        setResult((previous) => ({
          data: blocked ? undefined : previous?.data,
          error: blocked
            ? 'Your access changed. Check your session before viewing these figures.'
            : 'Workspace figures could not be refreshed.',
          revision,
          terminal: blocked,
        }));
        if (blocked) recheck.current();
      });
    return () => controller.abort();
  }, [wedding.id, user.id, membership.role, revision]);
  useEffect(() => {
    const refresh = (force = false) => {
      setTick(new Date());
      if (
        !terminal.current &&
        document.visibilityState !== 'hidden' &&
        (force || Date.now() - started.current >= 30000)
      )
        setRevision((value) => value + 1);
    };
    const onFocus = () => refresh();
    const onPage = (event) => {
      if (event.persisted) refresh(true);
    };
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('mmm-session');
    if (channel)
      channel.onmessage = ({ data }) => {
        if (
          ['wedding-changed', 'membership-changed'].includes(data) ||
          (data?.type === 'tasks-changed' && data.weddingId === wedding.id)
        )
          refresh(true);
      };
    const timer = window.setInterval(onFocus, 60000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPage);
      channel?.close();
    };
  }, [wedding.id]);
  const data = result?.data;
  const waiting = result?.revision !== revision;
  useEffect(() => {
    if (waiting || !requestedFocus.current) return;
    const target = [
      result?.error ? errorFocus.current : headingFocus.current,
      session.connectionErrorFocus?.current,
    ].find(
      (element) =>
        element?.isConnected &&
        !element.disabled &&
        !element.matches?.(':disabled') &&
        !element.closest?.('[inert]'),
    );
    if (!target) return;
    requestedFocus.current = false;
    target.focus();
  }, [waiting, result, session.connectionError, session.connectionErrorFocus]);
  const missing = result?.error ? 'Unavailable' : 'Loading…';
  const rows = [
    [Users, 'Collaborators', data ? `${data.collaborators} Active` : missing],
    [
      Mail,
      'Pending Invites',
      membership.role !== 'ADMIN'
        ? 'Admin only'
        : data
          ? `${data.pendingInvites} Pending`
          : missing,
    ],
    [
      CalendarCheck,
      'Scheduled Ceremonies',
      data
        ? `${data.ceremonies} ${data.ceremonies === 1 ? 'Event' : 'Events'}`
        : missing,
    ],
    [
      CircleCheck,
      'Tasks Progress',
      data ? (
        <>
          {data.tasks.total} Tasks{' '}
          <span className="text-xs font-normal text-[#514348]">
            ({data.tasks.completed} Done, {data.tasks.progress}%)
          </span>
        </>
      ) : (
        missing
      ),
    ],
    [Hourglass, 'Days to Mandap', settingsCountdown(wedding.mainDate, tick)],
  ];
  return (
    <section
      className="min-w-0 rounded-lg bg-white p-6 shadow-sm"
      aria-labelledby="settings-overview-heading"
      aria-busy={waiting}
    >
      <h2
        id="settings-overview-heading"
        ref={headingFocus}
        tabIndex={-1}
        className="text-base font-semibold"
      >
        Workspace Overview
      </h2>
      <div className="mt-5 flex flex-col gap-3">
        {rows.map(([Icon, label, value]) => (
          <div
            key={label}
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-[#f9f2f6] p-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <Icon
                size={18}
                className="shrink-0 text-primary"
                aria-hidden="true"
              />
              {label}
            </span>
            <span
              className={`min-w-0 text-right text-base font-semibold wrap-anywhere ${label === 'Pending Invites' ? 'text-[#514348]' : 'text-primary'}`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      {result?.error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className="mt-4 text-sm text-[#514348]"
        >
          {result.error}{' '}
          <button
            type="button"
            disabled={waiting || !!session.connectionError}
            className="text-primary underline disabled:opacity-50"
            onClick={() => {
              requestedFocus.current = true;
              if (result.terminal) session.retrySession();
              setRevision((value) => value + 1);
            }}
          >
            {waiting
              ? 'Retrying…'
              : result.terminal
                ? 'Retry session check'
                : 'Retry'}
          </button>
        </p>
      )}
    </section>
  );
}
