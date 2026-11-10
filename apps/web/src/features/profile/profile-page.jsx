'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  Info,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useSession } from '@/features/auth/session-provider';
import { PageHeader, SettingsTabs } from '@/features/dashboard/workspace-ui';
import styles from '@/features/dashboard/workspace-ui.module.css';
import { apiRequest } from '@/lib/api-client';
import { AvatarEditor } from './avatar-editor';

const endpoint = '/users/me';
const roles = {
  ADMIN: 'Admin',
  FAMILY_MEMBER: 'Family Member',
  VIEWER: 'Viewer',
};

function draftFrom(profile) {
  return { displayName: profile.displayName, phone: profile.phone ?? '' };
}

export function MyProfile({ accountId }) {
  const session = useSession();
  if (session.user.id !== accountId) return null;
  const role = roles[session.membership.role];
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow={`Workspace Settings · ${session.wedding.name}`}
        title="My Profile & Account Credentials"
        description="Your account identity and contact details for this wedding workspace."
      >
        <div className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3">
          <span className="grid size-10 place-items-center rounded-full bg-card text-primary">
            <ShieldCheck size={20} />
          </span>
          <div>
            <div className={styles.eyebrow}>Access Role</div>
            <div className="text-sm font-semibold">{role}</div>
          </div>
        </div>
      </PageHeader>
      <SettingsTabs active="/profile" />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ProfileForm
          key={accountId}
          user={session.user}
          onSaved={session.applySavedProfile}
        />
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2>Account Security</h2>
            <p className={styles.description}>
              Your email is verified. You sign in with your email and password.
            </p>
            <Link href="/forgot-password" className={`${styles.action} mt-5`}>
              <LockKeyhole size={16} />
              Reset password by email
            </Link>
          </section>
          <section className={styles.card}>
            <h2>Workspace Access</h2>
            <p className={styles.description}>Your current role is {role}.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function ProfileForm({ user, onSaved }) {
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(null);
  const lifetime = useRef(null);
  const saving = useRef(false);
  const accountId = user.id;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller.signal;
    apiRequest(endpoint, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (data.id !== accountId) {
          setError({
            message:
              'Your signed-in account changed. Reload this page to continue.',
          });
          return;
        }
        setProfile(data);
        setDraft(draftFrom(data));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure);
      });
    return () => controller.abort();
  }, [accountId, attempt]);

  const changes = {};
  if (draft && draft.displayName.trim() !== profile.displayName)
    changes.displayName = draft.displayName.trim();
  if (draft && draft.phone.trim() !== (profile.phone ?? ''))
    changes.phone = draft.phone.trim();
  const dirty = Object.keys(changes).length > 0;
  const conflict = [
    'PROFILE_CHANGED',
    'PROFILE_ACCOUNT_CHANGED',
    'PROFILE_VERSION_REQUIRED',
  ].includes(error?.code);

  function reload() {
    setProfile(null);
    setDraft(null);
    setError(null);
    setFeedback(null);
    setAttempt((value) => value + 1);
  }

  function edit(event) {
    const { name, value } = event.target;
    setDraft((previous) => ({ ...previous, [name]: value }));
    setFeedback(null);
    if (!conflict) setError(null);
  }

  async function save(event) {
    event.preventDefault();
    const signal = lifetime.current;
    if (!dirty || saving.current || conflict || !signal || signal.aborted)
      return;
    saving.current = true;
    setPending(true);
    setFeedback(null);
    setError(null);
    try {
      const { data } = await apiRequest(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': profile.version,
        },
        body: JSON.stringify(changes),
        signal,
      });
      if (signal.aborted) return;
      if (data.id !== accountId) {
        setError({
          code: 'PROFILE_ACCOUNT_CHANGED',
          message: 'Your signed-in account changed. Reload your profile.',
        });
        return;
      }
      setProfile(data);
      setDraft(draftFrom(data));
      onSaved(data);
      setFeedback('Profile changes saved.');
    } catch (failure) {
      if (!signal.aborted) setError(failure);
    } finally {
      saving.current = false;
      if (!signal.aborted) setPending(false);
    }
  }

  return (
    <section className={`${styles.card} !rounded-xl`}>
      <AvatarEditor user={user} onSaved={onSaved} />
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p role="alert">{error.message}</p>
          {(!profile || conflict) && (
            <button
              type="button"
              className="mt-1 min-h-11 underline"
              onClick={reload}
            >
              {conflict ? 'Discard and reload profile' : 'Retry'}
            </button>
          )}
        </div>
      )}
      {!profile && !error && <p role="status">Loading profile…</p>}
      {draft && (
        <form onSubmit={save} className="flex flex-col gap-5">
          <ProfileField
            label="Display Name"
            name="displayName"
            icon={UserRound}
            value={draft.displayName}
            onChange={edit}
            disabled={pending}
            error={error?.details?.displayName?.[0]}
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            badge="Used in your wedding workspace"
          />
          <ProfileField
            label="Account Email Address"
            name="accountEmail"
            icon={Mail}
            type="email"
            value={profile.email}
            readOnly
            badge={
              <>
                <LockKeyhole size={13} /> Read-Only
              </>
            }
          >
            <p className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
              <Info size={16} className="mt-0.5 shrink-0" />
              Used for sign-in and email verification.
            </p>
          </ProfileField>
          <ProfileField
            label="Direct Contact Number (Optional)"
            name="phone"
            icon={Phone}
            type="tel"
            value={draft.phone}
            onChange={edit}
            disabled={pending}
            maxLength={32}
            autoComplete="tel"
            placeholder="+91 98765 43210"
            error={error?.details?.phone?.[0]}
          />
          {feedback && (
            <p role="status" className="text-sm text-primary">
              {feedback}
            </p>
          )}
          <div
            className={`${styles.row} -mx-6 -mb-6 mt-2 rounded-b-xl bg-secondary p-6`}
          >
            <button
              type="button"
              className={styles.action}
              disabled={!dirty || pending}
              onClick={() => {
                setDraft(draftFrom(profile));
                if (!conflict) setError(null);
                setFeedback(null);
              }}
            >
              Discard Changes
            </button>
            <button
              type="submit"
              className={`${styles.action} ${styles.primary}`}
              disabled={!dirty || pending || conflict}
            >
              <CircleCheck size={17} />{' '}
              {pending ? 'Saving…' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function ProfileField({
  label,
  name,
  icon: Icon,
  badge,
  children,
  error,
  ...props
}) {
  const id = `profile-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}{' '}
          {props.required && (
            <span aria-hidden="true" className="text-red-700">
              *
            </span>
          )}
        </label>
        {badge && (
          <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="relative">
        <Icon
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute top-3.5 left-3 text-muted-foreground"
        />
        <input
          {...props}
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-11 w-full rounded-lg border bg-card py-2 pr-4 pl-10 text-sm shadow-sm read-only:bg-secondary read-only:pr-10 read-only:text-muted-foreground"
        />
        {props.readOnly && (
          <LockKeyhole
            aria-hidden="true"
            size={17}
            className="pointer-events-none absolute top-3.5 right-3 text-muted-foreground"
          />
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-800">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}
