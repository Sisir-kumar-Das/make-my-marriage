'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Brand } from './brand';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const links = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#for-families', label: 'For Families' },
  { href: '#wedding-website', label: 'Wedding Website' },
];

function AccountActions() {
  return (
    <>
      <button
        type="button"
        disabled
        aria-describedby="login-note"
        className="cursor-not-allowed px-2 py-2.5 text-sm font-medium text-[#5C5457] opacity-65"
      >
        Log In
      </button>
      <Link
        href="/register"
        className="rounded-full bg-[#6E334E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#542439]"
      >
        Start Planning
      </Link>
    </>
  );
}

export function HomepageHeader({ fontClassName }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-[#E7DED7]/80 bg-[#FBF7F2]/95 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <Brand />
        <nav
          aria-label="Homepage navigation"
          className="hidden items-center gap-5 lg:flex"
        >
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-[#5C5457] transition-colors hover:text-[#6E334E]"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <AccountActions />
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open homepage navigation"
              className="flex size-11 items-center justify-center rounded-lg border border-[#E7DED7] bg-[#FFFDFC] text-[#242124] lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className={`w-full max-w-sm overflow-y-auto border-[#E7DED7] bg-[#FBF7F2] text-[#242124] ${fontClassName}`}
            style={{ fontFamily: 'var(--font-landing-sans)' }}
          >
            <SheetHeader className="pr-12">
              <SheetTitle className="sr-only">
                Make My Marriage navigation
              </SheetTitle>
              <SheetClose asChild>
                <Brand />
              </SheetClose>
              <SheetDescription className="text-[#5C5457]">
                Plan every moment. Enjoy every memory.
              </SheetDescription>
            </SheetHeader>
            <nav
              aria-label="Mobile homepage navigation"
              className="flex flex-col px-6"
            >
              {links.map(({ href, label }) => (
                <SheetClose asChild key={href}>
                  <a
                    href={href}
                    className="border-b border-[#E7DED7] py-4 text-lg font-medium"
                  >
                    {label}
                  </a>
                </SheetClose>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-2 px-6">
              <AccountActions />
              <p className="mt-3 text-xs leading-relaxed text-[#5C5457]">
                Create your account and verify your email. Sign-in is coming
                soon.
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
