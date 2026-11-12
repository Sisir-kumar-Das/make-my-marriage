import Link from 'next/link';
import { Camera, ShieldCheck } from 'lucide-react';
import { ComingSoon, PageHeader, SettingsTabs } from './workspace-ui';
import styles from './workspace-ui.module.css';
import { DashboardCover } from '@/features/weddings/dashboard-cover';

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
            <div className="mt-5 overflow-hidden rounded-lg">
              <DashboardCover
                wedding={wedding}
                membership={membership}
                readOnly
              />
            </div>
            <p className={styles.description}>
              Your private wedding cover is managed from the dashboard. JPG or
              PNG up to 15 MB.
            </p>
            <Link href="/dashboard" className={`${styles.action} mt-5`}>
              <Camera size={16} />
              {membership.role === 'ADMIN'
                ? 'Manage wedding cover'
                : 'View wedding cover'}
            </Link>
          </section>
          <section className={styles.card}>
            <h2>Workspace Overview</h2>
            <div className={`${styles.stack} mt-5`}>
              {[
                'Collaborators',
                'Pending Invites',
                'Scheduled Ceremonies',
                'Tasks Progress',
              ].map((x) => (
                <div className={`${styles.soft} ${styles.row}`} key={x}>
                  <span className="text-sm">{x}</span>
                  <ComingSoon />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
