import Link from 'next/link';
import { Brand } from '@/features/home/brand';

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6"
    >
      <Brand href="/" className="!w-40" />
      <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">
        Page not found · 404
      </p>
      <h1 className="font-serif text-4xl text-primary">
        This page isn’t here.
      </h1>
      <p className="text-muted-foreground">
        Return to your wedding workspace to continue planning.
      </p>
      <Link
        href="/dashboard"
        className="w-fit font-semibold text-primary underline underline-offset-4"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
