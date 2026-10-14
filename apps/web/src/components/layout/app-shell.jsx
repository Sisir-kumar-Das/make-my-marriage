'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Menu, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { cn } from 'cn';

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-3"
      aria-label="Make My Marriage dashboard"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-card text-primary">
        <Heart className="size-5" aria-hidden="true" />
      </span>
      <span className="font-serif text-xl leading-tight">
        Make My
        <br />
        Marriage<span className="text-primary">.</span>
      </span>
    </Link>
  );
}

function Navigation({ pathname, mobile = false }) {
  return (
    <nav
      aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
      className="space-y-1"
    >
      {navigation.map(({ href, label, icon: Icon }, index) => {
        const link = (
          <Link
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-accent/70',
              pathname === href &&
                'bg-sidebar-accent font-semibold text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
        return (
          <div
            key={href}
            className={index === 5 ? 'mt-6 border-t pt-5' : undefined}
          >
            {mobile ? <SheetClose asChild>{link}</SheetClose> : link}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const pageLabel =
    navigation.find((item) => item.href === pathname)?.label ?? 'Workspace';

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar px-5 py-8 lg:flex">
        <Brand />
        <p className="mt-9 mb-3 px-3 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          Your planning space
        </p>
        <Navigation pathname={pathname} />
        <div className="mt-auto rounded-xl border bg-card/70 p-4">
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            Sample wedding
          </p>
          <p className="mt-2 font-serif text-lg">Ananya & Arjun</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3" aria-hidden="true" />
            Bhubaneswar, Odisha
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-card">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-3">
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-72 overflow-y-auto bg-sidebar"
                >
                  <SheetHeader className="pb-4">
                    <SheetTitle className="font-serif text-xl">
                      Make My Marriage
                    </SheetTitle>
                    <SheetDescription>
                      Your planning space · sample preview
                    </SheetDescription>
                  </SheetHeader>
                  <div className="px-4">
                    <Navigation pathname={pathname} mobile />
                  </div>
                </SheetContent>
              </Sheet>
              <p className="text-sm text-muted-foreground">
                <span className="hidden sm:inline">
                  Workspace <span className="mx-2 text-border">/</span>
                </span>
                <span className="font-medium text-foreground">{pageLabel}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="hidden border-primary/20 text-primary sm:inline-flex"
              >
                Sample preview
              </Badge>
              <Link
                href="/profile"
                aria-label="Open profile placeholder"
                className="flex size-9 items-center justify-center rounded-full bg-champagne text-xs font-semibold text-primary"
              >
                AA
              </Link>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-9"
        >
          <div className="mb-7 flex items-start gap-2 rounded-lg border border-primary/10 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-primary">
            <span className="font-semibold">Development preview.</span>
            <span>
              All planning content is sample data. Features are placeholders and
              changes are not saved.
            </span>
          </div>
          {children}
        </main>
        <footer className="mx-auto max-w-7xl px-5 pb-7 text-xs text-muted-foreground sm:px-8">
          Plan every moment. Enjoy every memory.
        </footer>
      </div>
    </div>
  );
}
