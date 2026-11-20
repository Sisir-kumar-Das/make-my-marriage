import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function PlaceholderPage({ title, description }) {
  return (
    <div>
      <h1 className="font-serif text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Card className="mt-8 max-w-2xl shadow-none">
        <CardContent className="flex flex-col items-start gap-4 py-8">
          <span className="rounded-full bg-muted p-3 text-primary">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <h2 className="font-serif text-2xl">A little more to come.</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This is a placeholder. No data is loaded or saved on this page yet.
          </p>
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <ArrowLeft className="size-4" />
              Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
