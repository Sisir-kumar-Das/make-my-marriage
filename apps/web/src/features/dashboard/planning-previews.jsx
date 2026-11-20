'use client';

import { Info, ShieldCheck } from 'lucide-react';
import { PageHeader, SettingsTabs } from './workspace-ui';
import styles from './workspace-ui.module.css';
import { DashboardCover } from '@/features/weddings/dashboard-cover';
import { SettingsOverview } from '@/features/weddings/settings-overview';

function roleLabel(role) {
  return role === 'ADMIN'
    ? 'Admin'
    : role === 'FAMILY_MEMBER'
      ? 'Family Member'
      : 'Viewer';
}
export function WeddingSettingsLayout({ session, children }) {
  const { wedding, membership } = session;
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Settings › Workspace & Account"
        title="Settings & Workspace Management"
        description="Your wedding identity, location, traditions and workspace preferences."
      >
        <span className={styles.soon}>
          Workspace Role: {roleLabel(membership.role)}
        </span>
      </PageHeader>
      <SettingsTabs active="/settings" />
      <div className="flex items-start justify-between gap-4 rounded-lg bg-[#f9f2f6] p-4 shadow-xs sm:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ffd5dd] text-[#7a5a61]">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold">Workspace Settings</p>
            <p className="text-sm text-[#514348]">
              {membership.role === 'ADMIN'
                ? `Manage high-level wedding details and ceremonial traditions for ${wedding.name}.`
                : 'You can view wedding details. Only Admins can edit these settings.'}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-xl bg-[#e8e0e4] px-2 py-1 text-xs font-semibold">
          {roleLabel(membership.role)}
        </span>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {children}
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2>Cover Presentation</h2>
            <p className={styles.description}>
              Featured banner image for your wedding workspace and dashboard.
            </p>
            <div className="mt-5">
              <DashboardCover
                key={`${session.user.id}/${wedding.id}/${membership.role}`}
                wedding={wedding}
                membership={membership}
                settingsControls
                disabled={!!session.connectionError}
                connectionErrorFocus={session.connectionErrorFocus}
                onSaved={(data) =>
                  session.applySavedWedding(session.user.id, data)
                }
              />
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#f9f2f6] p-3 text-xs text-[#514348]">
              <Info size={18} aria-hidden="true" className="shrink-0" />
              JPG or PNG up to 15 MB. Position and zoom your photo before
              saving.
            </p>
          </section>
          <SettingsOverview
            key={`${session.user.id}/${wedding.id}/${membership.role}`}
            session={session}
          />
        </div>
      </div>
    </div>
  );
}
