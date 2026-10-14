import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6"
    >
      <p className="text-sm font-semibold tracking-widest text-primary">
        MAKE MY MARRIAGE
      </p>
      <h1 className="font-serif text-4xl">This page isn’t here.</h1>
      <p className="text-muted-foreground">
        Return to the sample dashboard to continue exploring.
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
