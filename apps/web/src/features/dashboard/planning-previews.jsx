import Link from 'next/link';
import {
  BookOpen,
  Camera,
  ListChecks,
  MapPin,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  Mail,
  Info,
  Sparkles,
  LockKeyhole,
} from 'lucide-react';
import {
  ComingSoon,
  EmptyPanel,
  FutureButton,
  MetricPanels,
  PageHeader,
  ReadOnlyField,
  SearchFilters,
  SettingsTabs,
} from './workspace-ui';
import {
  weddingDate,
  traditions,
  budgetLabel,
} from '@/features/weddings/form-data';
import styles from './workspace-ui.module.css';
import { DashboardCover } from '@/features/weddings/dashboard-cover';

export function TasksPreview() {
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Master wedding plan · Task orchestration"
        title="Tasks & Checklist Templates"
        description="Coordinate ritual obligations, wedding preparations and recurring planning checkpoints."
      >
        <Link className={styles.action} href="/checklist">
          <BookOpen size={16} />
          Browse Templates
        </Link>
        <FutureButton primary>
          <Plus size={16} />
          Create Task
        </FutureButton>
      </PageHeader>
      <MetricPanels />
      <nav className={styles.tabs} aria-label="Task views">
        <span className="border-b-2 border-primary px-4 py-3 text-sm font-semibold text-primary">
          All Tasks
        </span>
        <button disabled>My Tasks · Coming soon</button>
        <Link href="/checklist">Checklist Templates</Link>
        <ComingSoon />
      </nav>
      <SearchFilters />
      <div className={styles.tableWrap}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {[
                  'Status',
                  'Task Title & Rhythm',
                  'Linked Event',
                  'Assignee',
                  'Due Date',
                  'Priority',
                ].map((x) => (
                  <th scope="col" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <EmptyPanel icon={ListChecks}>
          <h2>Your planning tasks</h2>
          <p>
            Task creation, assignments, recurrence and progress tracking are
            coming soon.
          </p>
        </EmptyPanel>
        <p className={styles.tableFooter}>Task management · Coming soon</p>
      </div>
    </div>
  );
}
export function ChecklistPreview() {
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Master wedding plan · Template catalog"
        title="Checklist Templates"
        description="Thoughtful starting points for your wedding traditions, with explicit generation when this feature arrives."
      >
        <ComingSoon />
      </PageHeader>
      <nav className={styles.tabs} aria-label="Checklist navigation">
        <Link href="/tasks">All Tasks</Link>
        <span className="border-b-2 border-primary px-4 py-3 text-sm font-semibold text-primary">
          Checklist Templates
        </span>
      </nav>
      <div className={styles.note}>
        <Info size={18} />
        <p>
          Templates are previews. Nothing is generated or added to your wedding
          yet.
        </p>
      </div>
      <div className={styles.columns}>
        {[
          [
            Sparkles,
            'Essential Odia Wedding Rituals',
            'A considered guide to traditional ceremonies and preparations.',
          ],
          [
            MapPin,
            'Venue & Logistics Setup',
            'Organize spaces, travel details and ceremony arrangements.',
          ],
          [
            Camera,
            'Photography & Video Coverage',
            'Keep the moments you want to remember in one place.',
          ],
          [
            Users,
            'Attire & Jewelry Fitment',
            'Coordinate outfits, fittings and finishing touches.',
          ],
        ].map(([Icon, title, copy]) => (
          <section className={styles.card} key={title}>
            <div className={styles.row}>
              <span className={styles.iconTile}>
                <Icon size={20} />
              </span>
              <ComingSoon />
            </div>
            <h2 className="mt-5">{title}</h2>
            <p className={`${styles.description} mb-5`}>{copy}</p>
            <FutureButton>Generate Tasks</FutureButton>
          </section>
        ))}
      </div>
    </div>
  );
}
export function MembersPreview({ session }) {
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Shared wedding workspace"
        title="Wedding Members & Collaborators"
        description="Plan together with explicit Admin, Family Member and Viewer permissions."
      >
        <FutureButton primary>
          <Plus size={16} />
          Invite Member
        </FutureButton>
      </PageHeader>
      <div className={styles.note}>
        <ShieldCheck size={18} />
        <p>
          Invitations and role changes are coming soon. Every invitation will
          require explicit acceptance.
        </p>
      </div>
      <section className={styles.card}>
        <div className={styles.row}>
          <h2>Active Planning Team</h2>
          <ComingSoon />
        </div>
        <p className={`${styles.description} mb-5`}>
          Your current membership is shown below. The full team directory is
          coming soon.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {['Member', 'Workspace Role', 'Permissions & Actions'].map(
                  (x) => (
                    <th key={x}>{x}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{session.user.displayName} · You</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {session.user.email}
                  </p>
                </td>
                <td>{roleLabel(session.membership.role)}</td>
                <td>
                  <FutureButton>Manage permissions</FutureButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className={styles.card}>
        <div className={styles.row}>
          <h2>Pending Invitations</h2>
          <ComingSoon />
        </div>
        <EmptyPanel icon={Mail}>
          <p>
            Send, resend and revoke invitations when member management is
            available.
          </p>
        </EmptyPanel>
      </section>
    </div>
  );
}
function roleLabel(role) {
  return role === 'ADMIN'
    ? 'Admin'
    : role === 'FAMILY_MEMBER'
      ? 'Family Member'
      : 'Viewer';
}
export function ProfilePreview({ session }) {
  return (
    <div className={styles.stack}>
      <PageHeader
        eyebrow="Workspace settings · Your account"
        title="My Profile & Account Credentials"
        description="Your account identity and contact details for this wedding workspace."
      >
        <span className={styles.soon}>
          {roleLabel(session.membership.role)}
        </span>
      </PageHeader>
      <SettingsTabs active="/profile" />
      <div className={styles.settingsGrid}>
        <section className={styles.card}>
          <div className={`${styles.soft} mb-7`}>
            <div className={styles.row}>
              <span className="flex size-16 items-center justify-center rounded-lg bg-primary text-xl text-white">
                {session.user.displayName
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')}
              </span>
              <div className="flex-1">
                <h2>Avatar & Photo Monogram</h2>
                <p className={styles.description}>
                  Personal profile photos are coming soon.
                </p>
              </div>
            </div>
            <div className={`${styles.actions} mt-4`}>
              <FutureButton primary>
                <Camera size={16} />
                Upload New Photo
              </FutureButton>
              <FutureButton>
                <Trash2 size={16} />
                Remove Photo
              </FutureButton>
            </div>
          </div>
          <div className={styles.fields}>
            <ReadOnlyField
              label="Display Name"
              value={session.user.displayName}
              note="Profile editing · Coming soon"
              full
            />
            <ReadOnlyField
              label="Account Email Address"
              value={session.user.email}
              note="Used for sign-in and verification. Read-only."
              full
            />
            <ReadOnlyField
              label="Direct Contact Number (Optional)"
              value="Coming soon"
              full
            />
          </div>
          <div className={`${styles.actions} mt-7`}>
            <FutureButton primary>Save Profile Changes</FutureButton>
          </div>
        </section>
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2>Account Security</h2>
            <p className={styles.description}>
              Email and password sign-in with persistent sessions. Your email is
              verified.
            </p>
            <Link href="/forgot-password" className={`${styles.action} mt-5`}>
              <LockKeyhole size={16} />
              Reset password by email
            </Link>
          </section>
          <section className={styles.card}>
            <h2>Workspace Access</h2>
            <p className={styles.description}>
              Your current role is {roleLabel(session.membership.role)}.
              Invitations and role management are coming soon.
            </p>
            <ComingSoon />
          </section>
        </div>
      </div>
    </div>
  );
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
