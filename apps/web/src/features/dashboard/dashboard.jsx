import Image from 'next/image';
import {
  CalendarDays,
  MapPin,
  CalendarPlus,
  ListChecks,
  Users,
  Heart,
} from 'lucide-react';
import { WeddingTitle } from '@/features/weddings/wedding-title';
import {
  weddingDate,
  traditions,
  budgetLabel,
} from '@/features/weddings/form-data';
import { ApiStatus } from './api-status';

export function Dashboard({ wedding, membership }) {
  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="relative aspect-[2/1] min-h-64">
          <Image
            src="/images/sample-couple.webp"
            alt="Default wedding cover"
            fill
            loading="eager"
            sizes="(min-width: 1024px) calc(100vw - 320px), 100vw"
            className="object-cover object-[center_25%]"
          />
          <span className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs text-primary">
            Signature cover · personal uploads coming soon
          </span>
        </div>
        <div className="p-5 text-center sm:p-9">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your celebration starts here
          </p>
          <WeddingTitle as="h1" name={wedding.name} />
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <CalendarDays size={16} aria-hidden="true" />
              {weddingDate(wedding.mainDate)}
            </p>
            <p className="flex items-center gap-2">
              <MapPin size={16} aria-hidden="true" />
              {wedding.location.city}, {wedding.location.state}
            </p>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {traditions.find(([key]) => key === wedding.tradition)?.[1] ||
              wedding.tradition}{' '}
            · India · IST
          </p>
          {wedding.estimatedBudget && membership.financeAccess && (
            <p className="mt-5 text-sm">
              Estimated budget:{' '}
              <span className="font-semibold">
                {budgetLabel(wedding.estimatedBudget.amountMinor)}
              </span>
            </p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <Heart className="mb-3 text-primary" size={22} aria-hidden="true" />
        <h2 className="font-serif text-2xl">
          A fresh beginning, just for you.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Your wedding is saved. Your ceremonies, tasks and shared plans will
          take shape here as you add them. No events or tasks have been
          generated automatically.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            CalendarPlus,
            'Your celebrations',
            'Add ceremonies, dates and venues to bring your wedding timeline together.',
          ],
          [
            ListChecks,
            'Your planning checklist',
            'Choose your tasks and tradition-based checklists when the planning tools arrive.',
          ],
          [
            Users,
            'Plan with family',
            'Invite trusted people as Admin, Family Member or Viewer when invitations arrive.',
          ],
        ].map(([Icon, title, description]) => (
          <section key={title} className="rounded-2xl border bg-card p-6">
            <Icon className="mb-4 text-primary" size={22} aria-hidden="true" />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <button
              disabled
              className="mt-5 min-h-11 rounded-full border px-4 py-2 text-xs text-muted-foreground disabled:cursor-not-allowed"
            >
              Coming soon
            </button>
          </section>
        ))}
      </div>
      <ApiStatus />
    </div>
  );
}
