'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { inter, playfair } from '@/features/home/fonts';
import styles from './auth.module.css';

export function AuthShell({ children }) {
  const login = usePathname() === '/login';
  const branding = (
    <>
      <Brand href="/" className="!w-48" />
      <Link href="/" className={styles.back}>
        <ArrowLeft size={14} />
        Back to home
      </Link>
    </>
  );
  return (
    <div
      className={`${styles.page} ${login ? styles.login : ''} ${inter.variable} ${playfair.variable}`}
    >
      {!login && <header className={styles.header}>{branding}</header>}
      <main id="main-content" className={styles.main}>
        <aside className={styles.artwork}>
          {login && <div className={styles.artHeader}>{branding}</div>}
          <div className={styles.artImage}>
            <Image
              src="/images/sample-couple.webp"
              alt=""
              fill
              loading="eager"
              sizes="(min-width: 1024px) 540px, 1px"
              className="object-cover object-[center_25%]"
            />
            {!login && (
              <div className={styles.overlay}>
                <p className={styles.eyebrow}>Your shared wedding workspace</p>
                <h2 className={styles.editorial}>
                  Shared Joy. Total Alignment.
                </h2>
                <p>
                  Bring your wedding events, tasks and family together in one
                  beautifully organized place.
                </p>
              </div>
            )}
          </div>
          {login ? (
            <div className={styles.artCopy}>
              <h2 className={styles.editorial}>
                Plan every moment.
                <br />
                <em>Enjoy every memory.</em>
              </h2>
              <p>A little more organized. A lot more present.</p>
            </div>
          ) : (
            <div className={styles.artCopy}>
              <ShieldCheck size={26} />
              <div>
                <h2 className="font-semibold">
                  Plan together, with confidence
                </h2>
                <p>
                  Admin, Family Member and Viewer permissions keep your wedding
                  workspace private.
                </p>
              </div>
            </div>
          )}
        </aside>
        <section aria-labelledby="auth-title" className={styles.formCard}>
          {login && <div className={styles.mobileBrand}>{branding}</div>}
          {children}
        </section>
      </main>
      <footer className={styles.footer}>
        <span>
          <LockKeyhole size={14} />
          Email verification · Secure persistent sessions
        </span>
        <span>Make My Marriage · Your private wedding workspace</span>
      </footer>
    </div>
  );
}
