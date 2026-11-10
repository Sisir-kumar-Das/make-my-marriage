import Link from 'next/link';
import { Clock3, Sparkles, Search, UserRound } from 'lucide-react';
import styles from './workspace-ui.module.css';
export function ComingSoon() {
  return (
    <span className={styles.soon}>
      <Clock3 size={11} aria-hidden="true" />
      Coming soon
    </span>
  );
}
export function FutureButton({ children, primary = false }) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={`${styles.action} ${primary ? styles.primary : ''}`}
    >
      {children}
      <span className="sr-only"> · Coming soon</span>
    </button>
  );
}
export function EmptyPanel({ children, icon: Icon = Sparkles }) {
  return (
    <div className={styles.empty}>
      <Icon size={25} aria-hidden="true" />
      {children}
      <ComingSoon />
    </div>
  );
}
export function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className={styles.pageHeader}>
      <div className="min-w-0">
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={`${styles.heading} mt-2`}>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}
export function SearchFilters({ kind = 'tasks' }) {
  return (
    <div className={`${styles.card} ${styles.filters}`}>
      <label className={styles.search}>
        <Search size={18} />
        <input
          disabled
          aria-label={`Search ${kind} · coming soon`}
          placeholder={`Search ${kind}…`}
        />
      </label>
      {(kind === 'events'
        ? ['Ceremony', 'Status']
        : ['Status', 'Priority', 'Assignee', 'Linked Event']
      ).map((label) => (
        <select
          key={label}
          disabled
          aria-label={`${label} filter · coming soon`}
        >
          <option>{label}: All</option>
        </select>
      ))}
      <ComingSoon />
    </div>
  );
}
export function SettingsTabs({ active }) {
  return (
    <nav
      className={
        active === '/profile'
          ? `${styles.tabs} ${styles.profileTabs}`
          : styles.tabs
      }
      aria-label="Workspace settings"
    >
      {[
        ['/settings', 'Wedding Settings'],
        ['/profile', 'My Profile'],
        ['/recovery', 'Deleted Items Recovery'],
      ].map(([href, label]) => (
        <Link
          href={href}
          key={href}
          aria-current={active === href ? 'page' : undefined}
        >
          {active === '/profile' && href === active && (
            <UserRound size={16} aria-hidden="true" />
          )}
          {label}
        </Link>
      ))}
      <button disabled>Wedding Workspace Lifecycle · Coming soon</button>
    </nav>
  );
}
export function ReadOnlyField({ label, value, note, full = false }) {
  return (
    <label className={`${styles.field} ${full ? styles.full : ''}`}>
      {label}
      <input readOnly value={value || 'Not specified'} />
      {note && <small>{note}</small>}
    </label>
  );
}
