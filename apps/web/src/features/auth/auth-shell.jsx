import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import styles from './auth.module.css';

export function AuthShell({ children }) {
  return (
    <div className={`${styles.page} ${inter.variable} ${playfair.variable}`}>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Brand href="/" />
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#5C5457] hover:text-[#6E334E]"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Back to home
        </Link>
      </header>
      <main
        id="main-content"
        className="mx-auto grid max-w-6xl gap-8 px-5 pb-12 pt-2 sm:px-8 lg:grid-cols-[0.85fr_1fr] lg:items-stretch lg:pt-8"
      >
        <aside className="hidden overflow-hidden rounded-3xl border border-[#E7DED7] bg-[#F5EEE7] lg:flex lg:flex-col">
          <div className="relative min-h-96 flex-1 overflow-hidden">
            <Image
              src="/images/sample-couple.webp"
              alt=""
              fill
              loading="eager"
              sizes="(min-width: 1024px) 450px, 1px"
              className="object-cover object-[center_25%]"
            />
          </div>
          <div className="shrink-0 p-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
              A little more organized. A lot more present.
            </p>
            <h2 className={styles.editorial}>
              Plan every moment.
              <br />
              <em className="text-[#6E334E]">Enjoy every memory.</em>
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-[#5C5457]">
              Bring your wedding events, tasks and family together in one
              beautifully organized place.
            </p>
            <p className="mt-6 border-t border-[#E7DED7] pt-5 text-sm font-medium text-[#6E334E]">
              Less to juggle. More to celebrate.
            </p>
          </div>
        </aside>
        <section
          aria-labelledby="auth-title"
          className="min-w-0 rounded-3xl border border-[#E7DED7] bg-[#FFFDFC] p-5 shadow-sm sm:p-9"
        >
          {children}
        </section>
      </main>
    </div>
  );
}
