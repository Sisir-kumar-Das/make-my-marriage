'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import {
  CalendarDays,
  ChevronDown,
  Eye,
  Menu,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { navigation } from '@/lib/navigation';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import { weddingDate } from '@/features/weddings/form-data';
import {
  AvatarPhoto,
  initials,
  useAvatarPhoto,
} from '@/features/profile/avatar-photo';
import { useSession } from '@/features/auth/session-provider';
import { apiRequest } from '@/lib/api-client';
import {
  badgeAfterFailure,
  noAccessStatuses,
} from '@/features/dashboard/dashboard-data';
import styles from './workspace.module.css';

function Navigation({ pathname, mobile = false, memberCount }) {
  return (
    <nav
      aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
      className={styles.nav}
    >
      {navigation
        .filter(({ href }) => !['/profile', '/recovery'].includes(href))
        .map(({ href, label, icon: Icon }) => {
          const link = (
            <Link
              href={href}
              aria-current={
                pathname === href ||
                (href === '/dashboard' && pathname === '/activity') ||
                (href === '/settings' &&
                  ['/profile', '/recovery'].includes(pathname))
                  ? 'page'
                  : undefined
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
              {href === '/members' && memberCount > 0 && (
                <span className={styles.navCount}>{memberCount} Active</span>
              )}
            </Link>
          );
          return mobile ? (
            <SheetClose key={href} asChild>
              {link}
            </SheetClose>
          ) : (
            <div key={href}>{link}</div>
          );
        })}
    </nav>
  );
}
// Stitch shows the current active member count beside Members. Express counts only current
// eligible members. The count belongs to one account + wedding scope and is hidden until it
// loads, after a scope change or if the request fails.
export function useMemberCount(userId, weddingId) {
  const scope = `${userId}:${weddingId}`;
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const started = useRef(0);
  // The scope that already used its one quick retry since the last good count.
  const retried = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let retryTimer;
    started.current = Date.now();
    // Same 15-second limit as the dashboard summary, so a slow network still gets a count.
    void apiRequest(`/weddings/${weddingId}/members/count`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        retried.current = null;
        setResult({ scope, count: response.data.counts.ALL });
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult((previous) => badgeAfterFailure(previous, scope, failure));
        // One quick retry after a hiccup; later recounts follow focus/membership changes.
        if (
          retried.current !== scope &&
          !noAccessStatuses.includes(failure?.status)
        ) {
          retried.current = scope;
          retryTimer = window.setTimeout(
            () => setRevision((value) => value + 1),
            5000,
          );
        }
      });
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [weddingId, scope, revision]);
  useEffect(() => {
    const recount = () => setRevision((value) => value + 1);
    // Returning to the tab picks up changes made elsewhere, at most every 30 seconds from the
    // last request start, so a slow request in flight is not restarted.
    const onFocus = () => {
      if (Date.now() - started.current >= 30000) recount();
    };
    window.addEventListener('focus', onFocus);
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('mmm-session')
        : null;
    // Recount after membership changes; logout is handled by the session provider.
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === 'membership-changed') recount();
      };
    return () => {
      window.removeEventListener('focus', onFocus);
      channel?.close();
    };
  }, []);
  return result?.scope === scope ? result.count : null;
}
function WeddingCard({ wedding }) {
  return (
    <div className={styles.weddingCard}>
      <div>
        <h2 className={styles.weddingName}>{wedding.name}</h2>
        <span className={styles.weddingBadge}>Wedding</span>
      </div>
      <p>
        <CalendarDays size={14} aria-hidden="true" />
        {weddingDate(wedding.mainDate)}
      </p>
    </div>
  );
}
function BrandRow() {
  return (
    <div className={styles.brandRow}>
      <Brand href="/dashboard" className="!w-24" />
      <span>Make My Marriage</span>
    </div>
  );
}
export function AppShell({ children }) {
  const { user, wedding, membership, logout, pending } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const memberCount = useMemberCount(user.id, wedding.id);
  const avatarPhoto = useAvatarPhoto(user.avatar, user.id);
  const monogram = initials(user.displayName);
  const role =
    membership.role === 'ADMIN'
      ? 'Admin'
      : membership.role === 'FAMILY_MEMBER'
        ? 'Family Member'
        : 'Viewer';
  return (
    <div className={`${styles.shell} ${inter.variable} ${playfair.variable}`}>
      <aside className={styles.sidebar}>
        <BrandRow />
        <WeddingCard wedding={wedding} />
        <div className={styles.navArea}>
          <p className={styles.navLabel}>Workspace</p>
          <Navigation pathname={pathname} memberCount={memberCount} />
        </div>
        <Link href="/profile" className={styles.userCard}>
          <span
            className={`${styles.avatar} relative overflow-hidden`}
            aria-hidden="true"
          >
            {monogram}
            <AvatarPhoto photo={avatarPhoto} frame={user.avatar?.frame} />
          </span>
          <div>
            <strong>{user.displayName}</strong>
            <p>{role}</p>
          </div>
          <Settings size={16} aria-hidden="true" />
        </Link>
      </aside>
      <div className={styles.body}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.breadcrumb}>
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={styles.mobileTrigger}
                    aria-label="Open navigation"
                  >
                    <Menu size={22} />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-72 overflow-y-auto bg-sidebar p-0"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Make My Marriage</SheetTitle>
                    <SheetDescription>
                      Wedding workspace navigation
                    </SheetDescription>
                  </SheetHeader>
                  <BrandRow />
                  <WeddingCard wedding={wedding} />
                  <div className="px-4">
                    <Navigation
                      pathname={pathname}
                      memberCount={memberCount}
                      mobile
                    />
                  </div>
                </SheetContent>
              </Sheet>
              <span>Project /</span>
              <strong>{wedding.name}</strong>
            </div>
            <div className={styles.account}>
              <span className={`${styles.role} ${styles.headerRole}`}>
                {role}
              </span>
              <div className={styles.accountMenu}>
                <DropdownMenu.Root key={pathname} modal={false}>
                  <DropdownMenu.Trigger
                    className={styles.accountTrigger}
                    aria-label="Account menu"
                  >
                    <span
                      className={`${styles.avatar} relative overflow-hidden`}
                      aria-hidden="true"
                    >
                      {monogram}
                      <AvatarPhoto
                        photo={avatarPhoto}
                        frame={user.avatar?.frame}
                      />
                    </span>
                    <span className={styles.accountName}>
                      {user.displayName}
                    </span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content
                    className={styles.accountPopover}
                    align="end"
                    sideOffset={8}
                    collisionPadding={16}
                  >
                    <DropdownMenu.Label className="flex items-center gap-2">
                      <span
                        className={`${styles.avatar} relative overflow-hidden`}
                        aria-hidden="true"
                      >
                        {monogram}
                        <AvatarPhoto
                          photo={avatarPhoto}
                          frame={user.avatar?.frame}
                        />
                      </span>
                      <div className="min-w-0">
                        <strong>{user.displayName}</strong>
                        <p>{user.email}</p>
                      </div>
                    </DropdownMenu.Label>
                    <DropdownMenu.Item asChild className={styles.accountItem}>
                      <Link href="/profile">My Profile</Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item asChild className={styles.accountItem}>
                      <Link href="/invitations">My Invitations</Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={styles.accountItem}
                      disabled={pending}
                      onSelect={() => logout()}
                    >
                      {pending ? 'Signing out…' : 'Log out'}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" className={styles.main}>
          <div className={styles.statusBar}>
            <span>
              <span className="size-1.5 rounded-full bg-primary" />
              Your wedding workspace · More planning tools coming soon
            </span>
            <span className={styles.accessMode}>
              {membership.role === 'VIEWER' ? (
                <Eye size={14} />
              ) : (
                <ShieldCheck size={14} />
              )}
              Viewing as {role}
            </span>
          </div>
          {children}
        </main>
        <footer className={styles.footer}>
          Make My Marriage · Plan every moment. Enjoy every memory.
        </footer>
      </div>
    </div>
  );
}
