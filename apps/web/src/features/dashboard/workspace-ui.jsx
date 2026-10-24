import Link from 'next/link';
import {
  Clock3,
  Sparkles,
  Search,
  ListTodo,
  CircleCheck,
  Clock,
  TriangleAlert,
} from 'lucide-react';
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
export function MetricPanels() {
  return (
    <div className={styles.metrics}>
      {[
        [ListTodo, 'Total Tasks'],
        [CircleCheck, 'Completed'],
        [Clock, 'In Progress'],
        [TriangleAlert, 'Overdue'],
      ].map(([Icon, label], i) => (
        <div className={styles.metric} key={label}>
          <span
            className={styles.iconTile}
            style={{
              background: ['#f3ecf0', '#f9dfb0', '#ffd5dd', '#ffdad6'][i],
            }}
          >
            <Icon size={18} />
          </span>
          <div>
            <strong aria-label={`${label}: coming soon`}>—</strong>
            <p>{label}</p>
            <small>Planning tools coming soon</small>
          </div>
        </div>
      ))}
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
    <nav className={styles.tabs} aria-label="Workspace settings">
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
