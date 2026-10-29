'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { refreshState } from '@/lib/refresh-state';
import { useSession } from '@/features/auth/session-provider';
import styles from './members.module.css';
import { MemberInvitations } from '@/features/invitations/member-invitations';
import { MemberEditor } from './member-editor';
import { MemberRemoval } from './member-removal';

const roles = [
  ['ALL', 'All'],
  ['ADMIN', 'Admins'],
  ['FAMILY_MEMBER', 'Family'],
  ['VIEWER', 'Viewers'],
];
const roleLabels = {
  ADMIN: 'Admin',
  FAMILY_MEMBER: 'Family Member',
  VIEWER: 'Viewer',
};
const roleDescriptions = {
  ADMIN: 'Wedding settings, members and planning',
  FAMILY_MEMBER: 'Events, tasks and checklist planning',
  VIEWER: 'Read-only wedding planning access',
};
function RoleIcon({ role }) {
  const Icon = role === 'ADMIN' ? ShieldCheck : role === 'VIEWER' ? Eye : Users;
  return <Icon size={14} aria-hidden="true" />;
}
function Soon({ children, primary = false, compact = false }) {
  return (
    <button
      type="button"
      disabled
      className={primary ? styles.primary : styles.secondary}
      title="Coming soon"
    >
      {children}
      {!compact && <span className={styles.soon}>Coming soon</span>}
    </button>
  );
}
function initials(name) {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('')
    .toLocaleUpperCase();
}

export function MembersPage({ inviteShortcut = false }) {
  const inviteTrigger = useRef(null);
  const memberTrigger = useRef(null),
    teamHeading = useRef(null);
  const [editing, setEditing] = useState(null),
    [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(inviteShortcut);
  const { user, wedding, membership, connectionError, retrySession } =
    useSession();
  const [role, setRole] = useState('ALL');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const scope = JSON.stringify([
    wedding.id,
    user.id,
    membership.role,
    role,
    page,
  ]);
  const key = `${scope}/${revision}`;
  useEffect(() => {
    if (connectionError) return;
    const controller = new AbortController();
    let active = true;
    const query = new URLSearchParams({ page: String(page), limit: '20' });
    if (role !== 'ALL') query.set('role', role);
    void apiRequest(`/weddings/${wedding.id}/members?${query}`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (active) setResult({ scope, key, data: response.data });
      })
      .catch((error) => {
        if (active) setResult({ scope, key, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, scope, wedding.id, role, page, connectionError]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden')
        setRevision((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, []);
  const snapshot = refreshState(result, scope, key);
  const error = connectionError || snapshot.error;
  const data = !connectionError ? snapshot.data : null;
  const loading = snapshot.loading && !connectionError;
  const refreshing = snapshot.refreshing && !connectionError;
  const canManage = membership.role === 'ADMIN';
  const pagination = data?.pagination;
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.breadcrumb}>
            Settings &amp; Access <span>/</span> <strong>Collaborators</strong>
          </p>
          <h1>Wedding Members &amp; Collaborators</h1>
          <div className={styles.summary}>
            <span className={styles.memberCount}>
              {data
                ? `${data.counts.ALL} Active ${data.counts.ALL === 1 ? 'Member' : 'Members'}`
                : loading
                  ? 'Loading members…'
                  : 'Member count unavailable'}
            </span>
            {canManage && (
              <span className={styles.invitePreview}>Email invitations</span>
            )}
          </div>
        </div>
        {canManage && (
          <div className={styles.actions}>
            <Soon>
              <Download size={16} aria-hidden="true" />
              Export Directory
            </Soon>
            <button
              ref={inviteTrigger}
              type="button"
              className={styles.primary}
              onClick={() => setInviteOpen(true)}
            >
              <Plus size={16} aria-hidden="true" /> Invite Member
            </button>
          </div>
        )}
      </header>
      <section className={styles.safety} aria-label="Admin safety rule">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2>A wedding must keep at least one Admin</h2>
          <p>
            Role changes and member removal must keep at least one active Admin.
            Removal requires an explicit choice for affected unfinished work.
          </p>
        </div>
        <span className={styles.soon}>Last Admin protected</span>
      </section>
      <section
        className={styles.team}
        aria-labelledby="planning-team-title"
        aria-busy={loading || refreshing}
      >
        <div className={styles.teamHeader}>
          <div>
            <h2 id="planning-team-title" tabIndex={-1} ref={teamHeading}>
              Active Planning Team
            </h2>
            <p>
              Family and collaborators who have confirmed access to your wedding
              workspace.
            </p>
          </div>
          <button
            type="button"
            className={styles.refresh}
            disabled={loading || refreshing}
            onClick={() =>
              connectionError
                ? retrySession()
                : setRevision((value) => value + 1)
            }
          >
            <RefreshCw size={15} aria-hidden="true" />
            <span role={refreshing ? 'status' : undefined}>
              {refreshing ? 'Refreshing members…' : 'Refresh members'}
            </span>
          </button>
        </div>
        {notice && (
          <p role="status" className={styles.explanation}>
            {notice}
          </p>
        )}
        <div
          className={styles.filters}
          role="group"
          aria-label="Filter members by role"
        >
          {roles.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={role === value}
              onClick={() => {
                setRole(value);
                setPage(1);
              }}
            >
              {label} ({data ? data.counts[value] : '—'})
            </button>
          ))}
        </div>
        {loading && (
          <p className={styles.state} role="status">
            Loading your wedding members…
          </p>
        )}
        {error && (
          <div role="alert" className={styles.error}>
            <p>{error}</p>
            <button
              type="button"
              className={styles.secondary}
              onClick={() =>
                connectionError
                  ? retrySession()
                  : setRevision((value) => value + 1)
              }
            >
              Retry members
            </button>
          </div>
        )}
        {data && (
          <>
            {data.members.length === 0 ? (
              <div className={styles.state}>
                <Users size={24} aria-hidden="true" />
                <p>No active members match this role.</p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setRole('ALL');
                    setPage(1);
                  }}
                >
                  Show all members
                </button>
              </div>
            ) : (
              <>
                <p className={styles.mobileHint}>
                  Swipe the table to see all columns.
                </p>
                <div
                  className={styles.tableWrap}
                  tabIndex={0}
                  role="region"
                  aria-label="Active wedding members table"
                >
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Member</th>
                        <th scope="col">Assigned Role</th>
                        <th scope="col">Open Tasks</th>
                        <th scope="col">Status</th>
                        <th scope="col">Permissions &amp; Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.members.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <div className={styles.identity}>
                              <span
                                className={styles.avatar}
                                data-creator={member.isCreator}
                                aria-hidden="true"
                              >
                                {initials(member.name)}
                              </span>
                              <div className={styles.identityText}>
                                <div className={styles.name}>
                                  <strong>{member.name}</strong>
                                  {member.isYou && (
                                    <span className={styles.you}>You</span>
                                  )}
                                </div>
                                {member.relationship ? (
                                  <span className={styles.relationship}>
                                    {member.relationship}
                                  </span>
                                ) : (
                                  !member.isCreator && (
                                    <span
                                      className={styles.missingRelationship}
                                    >
                                      Relationship not set
                                    </span>
                                  )
                                )}
                                {member.email && (
                                  <p className={styles.email}>{member.email}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={styles.roleBadge}
                              data-role={member.role}
                            >
                              <RoleIcon role={member.role} />
                              {roleLabels[member.role]}
                            </span>
                          </td>
                          <td>
                            <span className={styles.taskCount}>
                              {member.openTaskCount}{' '}
                              {member.openTaskCount === 1 ? 'Task' : 'Tasks'}
                            </span>
                          </td>
                          <td>
                            <span className={styles.active}>Active</span>
                          </td>
                          <td>
                            {!canManage && (
                              <p className={styles.permissions}>
                                {roleDescriptions[member.role]}
                              </p>
                            )}
                            {canManage && (
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  disabled={!!connectionError}
                                  onClick={(event) => {
                                    memberTrigger.current = event.currentTarget;
                                    setEditing(member.id);
                                    setNotice('');
                                  }}
                                >
                                  Change Role
                                </button>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  disabled={!!connectionError}
                                  onClick={(event) => {
                                    memberTrigger.current = event.currentTarget;
                                    setRemoving(member.id);
                                    setNotice('');
                                  }}
                                >
                                  Remove Member
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <nav className={styles.pagination} aria-label="Members pages">
              <p>
                {pagination.total} matching{' '}
                {pagination.total === 1 ? 'member' : 'members'} · Page{' '}
                {pagination.page} of {Math.max(1, pagination.totalPages)}
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pagination.page <= 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
        <div className={styles.explanation}>
          <p>
            Open tasks are assigned To Do and In Progress tasks, including
            overdue work. Completed, deleted and retired tasks are excluded.
            Shared tasks count for each assignee.
          </p>
          <p>
            Email addresses are visible only to Admins and the member
            themselves.
          </p>
        </div>
      </section>
      {canManage && removing && (
        <MemberRemoval
          key={removing}
          memberId={removing}
          onClose={() => setRemoving(null)}
          onReturnFocus={() => {
            const target = memberTrigger.current?.isConnected
              ? memberTrigger.current
              : teamHeading.current;
            target?.focus({ preventScroll: true });
          }}
          onSaved={(outcome) => {
            memberTrigger.current = teamHeading.current;
            setRemoving(null);
            setNotice(
              outcome.replayed
                ? 'Your earlier removal was already saved. The directory shows current members.'
                : 'Member access removed. The confirmed assignment changes are saved.',
            );
            setRevision((n) => n + 1);
            retrySession();
            if (typeof BroadcastChannel !== 'undefined') {
              const channel = new BroadcastChannel('mmm-session');
              channel.postMessage('membership-changed');
              channel.close();
            }
          }}
        />
      )}
      {canManage && editing && (
        <MemberEditor
          key={editing}
          memberId={editing}
          onClose={() => setEditing(null)}
          onReturnFocus={() => {
            const target = memberTrigger.current?.isConnected
              ? memberTrigger.current
              : teamHeading.current;
            target?.focus({ preventScroll: true });
          }}
          onSaved={(result) => {
            // The edited row may leave its role filter or lose its Admin controls.
            memberTrigger.current = teamHeading.current;
            setEditing(null);
            setNotice(
              result.replayed
                ? 'Your earlier member change was already saved. The directory shows the current access.'
                : 'Member changes saved. The directory shows the current access.',
            );
            setRevision((value) => value + 1);
            retrySession();
            if (typeof BroadcastChannel !== 'undefined') {
              const channel = new BroadcastChannel('mmm-session');
              channel.postMessage('membership-changed');
              channel.close();
            }
          }}
        />
      )}
      {canManage && (
        <MemberInvitations
          triggerRef={inviteTrigger}
          open={inviteOpen}
          setOpen={setInviteOpen}
          inviteShortcut={inviteShortcut}
          onMembersRefresh={() => setRevision((value) => value + 1)}
        />
      )}
    </div>
  );
}
