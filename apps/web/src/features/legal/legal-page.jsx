import Link from 'next/link';
import { Brand } from '@/features/home/brand';

export function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen bg-[#FBF7F2] px-6 py-10 font-sans text-[#242124]">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-6">
        <Brand href="/" />
        <Link
          href="/"
          className="text-sm text-[#6E334E] underline underline-offset-4"
        >
          Back to home
        </Link>
      </header>
      <main
        id="main-content"
        className="mx-auto mt-10 max-w-3xl space-y-6 rounded-2xl border border-[#E9DCE3] bg-white p-6 leading-relaxed sm:p-10"
      >
        <h1 className="font-serif text-4xl text-[#531D37]">{title}</h1>
        <p className="text-xs text-[#5C5457]">Updated 25 October 2026</p>
        {children}
        <nav
          aria-label="Legal pages"
          className="flex gap-6 border-t border-[#E9DCE3] pt-5 text-sm text-[#6E334E] underline underline-offset-4"
        >
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </main>
    </div>
  );
}
