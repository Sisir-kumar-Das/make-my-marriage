import Link from 'next/link';
import { Camera, ShieldCheck } from 'lucide-react';
import {
  ComingSoon,
  FutureButton,
  PageHeader,
  ReadOnlyField,
  SettingsTabs,
} from './workspace-ui';
import {
  weddingDate,
  traditions,
  budgetLabel,
} from '@/features/weddings/form-data';
import styles from './workspace-ui.module.css';
import { DashboardCover } from '@/features/weddings/dashboard-cover';

function roleLabel(role) {
  return role === 'ADMIN'
    ? 'Admin'
    : role === 'FAMILY_MEMBER'
      ? 'Family Member'
      : 'Viewer';
}
export function SettingsPreview({ session }) {
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
      <div className={styles.note}>
        <ShieldCheck size={20} />
        <p>
          <strong>Workspace Settings</strong>
          <br />
          Your saved wedding details are shown below. Editing these details is
          coming soon.
        </p>
      </div>
      <div className={styles.settingsGrid}>
        <section className={styles.card}>
          <div className={`${styles.row} mb-7`}>
            <h2>Wedding Details</h2>
            <ComingSoon />
          </div>
          <div className={styles.fields}>
            <ReadOnlyField
              label="Wedding Workspace Title"
              value={wedding.name}
              full
            />
            <ReadOnlyField label="Bride Name" value={wedding.brideName} />
            <ReadOnlyField label="Groom Name" value={wedding.groomName} />
            <ReadOnlyField
              label="Main Wedding Date"
              value={weddingDate(wedding.mainDate)}
            />
            <ReadOnlyField
              label="Ceremonial Tradition"
              value={
                traditions.find(([k]) => k === wedding.tradition)?.[1] ||
                wedding.tradition
              }
            />
            <ReadOnlyField label="City" value={wedding.location.city} />
            <ReadOnlyField label="State" value={wedding.location.state} />
            <ReadOnlyField label="Country" value="India" />
            <ReadOnlyField
              label="Workspace Timezone"
              value="Asia/Kolkata (IST, UTC+5:30)"
            />
            {membership.financeAccess && (
              <ReadOnlyField
                label="Estimated Overall Budget (Optional)"
                value={
                  wedding.estimatedBudget
                    ? budgetLabel(wedding.estimatedBudget.amountMinor)
                    : 'Not specified'
                }
                full
              />
            )}
          </div>
          <div className={`${styles.actions} mt-7`}>
            <FutureButton primary>Save Wedding Settings</FutureButton>
          </div>
        </section>
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
