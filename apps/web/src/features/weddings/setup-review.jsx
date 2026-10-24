'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  CloudUpload,
  Heart,
  ListChecks,
  LockKeyhole,
  PartyPopper,
  Pencil,
  ShieldCheck,
  Sparkles,
  Layers,
  Users,
  X,
} from 'lucide-react';
import { Brand } from '@/features/home/brand';
import { budgetLabel, budgetMinor, traditions, weddingDate } from './form-data';
import styles from './weddings.module.css';
import { CoverEditor } from './cover-editor';

const nextActions = [
  [
    CalendarDays,
    'Add your first event',
    'Bring your ceremonies and their details together.',
  ],
  [
    ListChecks,
    'Checklist templates',
    'Start with a thoughtful list for your wedding traditions.',
  ],
  [
    Users,
    'Invite collaborators',
    'Plan together with your family and trusted coordinators.',
  ],
];

export function WeddingReview({ values, onEdit, cover, busy, onFrameChange }) {
  const coverFileId = useId();
  const tradition = traditions.find(([key]) => key === values.tradition)?.[1];
  const budget = budgetMinor(values.budget);
  const budgetText =
    budget === undefined ? 'Not specified' : budgetLabel(budget || 0);

  return (
    <>
      <div className={styles.reviewMain}>
        <section className={styles.panel} aria-labelledby="identity-heading">
          <ReviewHeading
            number="01"
            id="identity-heading"
            title="Couple & Celebration Identity"
            description="Core partner identification & date"
            onEdit={() => onEdit(0)}
            editLabel="Edit wedding details"
          />
          <dl className={styles.detailGrid}>
            <Detail label="Workspace title" value={values.name} />
            <Detail label="Bride" value={values.brideName} />
            <Detail label="Groom" value={values.groomName} />
            <Detail
              label="Main wedding date"
              value={weddingDate(values.mainDate)}
            />
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="locale-heading">
          <ReviewHeading
            number="02"
            id="locale-heading"
            title="Locale, Tradition & Budget"
            description="Regional traditions and timezone defaults"
            onEdit={() => onEdit(1)}
            editLabel="Edit place, tradition and budget"
          />
          <dl className={styles.detailGrid}>
            <Detail
              label="Location"
              value={`${values.city}, ${values.state}`}
              note="India (IN)"
            />
            <Detail label="Wedding tradition" value={tradition} />
            <Detail
              label="Estimated budget"
              value={budgetText}
              note="Admin reference only"
            />
            <Detail
              label="Standard timezone"
              value="Asia/Kolkata"
              note="IST (UTC+5:30)"
            />
          </dl>
        </section>

        <section
          className={`${styles.panel} ${styles.coverPanel}`}
          aria-labelledby="cover-heading"
        >
          <div className={styles.coverHeading}>
            <div>
              <span className={styles.activeBadge}>
                Step 3 of 3 · Cover & Review
              </span>
              <h2
                id="cover-heading"
                className={`${styles.heading} ${styles.coverTitle}`}
              >
                Cover Imagery & Visual Tone
              </h2>
              <p className={styles.description}>
                Choose the look of your wedding workspace. Our signature cover
                is ready for your first chapter.
              </p>
            </div>
            <span className={styles.editorialBadge}>
              <Sparkles size={14} aria-hidden="true" /> Signature cover
            </span>
          </div>
          <div className={styles.coverGrid}>
            <button
              type="button"
              className={
                cover.selection ? styles.futureCover : styles.selectedCover
              }
              aria-pressed={!cover.selection}
              aria-label="Use signature wedding cover"
              onClick={cover.reset}
            >
              <div className={styles.coverImage}>
                <Image
                  src="/images/sample-couple.webp"
                  alt="Couple in a serene courtyard, the selected default wedding cover"
                  fill
                  sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 85vw"
                  className="object-cover object-[center_25%]"
                />
                {!cover.selection && (
                  <span className={styles.selectedCheck}>
                    <Check size={14} aria-hidden="true" />
                  </span>
                )}
                <span className={styles.imageBadge}>
                  {cover.selection ? 'Signature' : 'Selected'}
                </span>
              </div>
              <h3>Editorial Illustration</h3>
              <p>
                A warm courtyard portrait in our signature ivory and plum
                palette.
              </p>
              <span className={styles.coverNote}>
                <ShieldCheck size={14} aria-hidden="true" /> Included cover
              </span>
            </button>
            <label
              htmlFor={coverFileId}
              className={
                cover.selection ? styles.selectedCover : styles.futureCover
              }
            >
              <span className={styles.coverPlaceholder}>
                <CloudUpload size={30} aria-hidden="true" />
                <span>
                  {cover.selection
                    ? 'Your photo is selected'
                    : 'Bring your own memories'}
                </span>
              </span>
              <span className={styles.coverOptionTitle}>Custom Upload</span>
              <span className={styles.coverOptionDescription}>
                Personalize your workspace with a JPG or PNG up to 15 MB.
              </span>
              <span className={styles.coverNote}>
                {cover.selection
                  ? 'Selected · preview below'
                  : 'Choose your photo'}
              </span>
            </label>
            <button type="button" disabled className={styles.futureCover}>
              <span className={styles.coverPlaceholder}>
                <Layers size={28} aria-hidden="true" />
                <span>Clean Ivory Monogram</span>
                <em className={styles.monogram}>
                  {values.brideName.trim().charAt(0)} &{' '}
                  {values.groomName.trim().charAt(0)}
                </em>
              </span>
              <span className={styles.coverOptionTitle}>
                Minimalist & Clean
              </span>
              <span className={styles.coverOptionDescription}>
                A quiet ivory backdrop with a focus on your names and date.
              </span>
              <span className={styles.comingSoon}>Coming soon</span>
            </button>
          </div>
          <CoverEditor
            fileInputId={coverFileId}
            cover={cover}
            disabled={busy}
            onFrameChange={onFrameChange}
          />
          <p className={styles.privacyNote}>
            <LockKeyhole size={17} aria-hidden="true" /> Your wedding workspace
            is private. Creating it does not publish a guest website.
          </p>
        </section>
      </div>

      <aside className={styles.reviewAside} aria-label="Wedding summary">
        <div className={styles.panel}>
          <div className={styles.registryBrand}>
            <Brand href="/" className="!w-28" />
            <span>
              YOUR PRIVATE
              <br />
              <strong>Wedding workspace</strong>
            </span>
          </div>
          <p className={styles.description}>
            Your ceremonies, family and planning details, thoughtfully organized
            in one shared space.
          </p>
        </div>
        <section className={styles.panel} aria-labelledby="recap-heading">
          <div className={styles.recapHeader}>
            <h2 id="recap-heading" className={styles.eyebrow}>
              Summary recap
            </h2>
            <span className={styles.softBadge}>Ready to create</span>
          </div>
          <dl className={styles.recap}>
            <Recap
              label="Couple names"
              value={`${values.brideName} & ${values.groomName}`}
            />
            <Recap label="Wedding date" value={weddingDate(values.mainDate)} />
            <Recap
              label="Primary location"
              value={`${values.city}, ${values.state}`}
            />
            <Recap label="Wedding tradition" value={tradition} />
            <Recap label="Estimated budget" value={budgetText} />
            <Recap
              label="Artwork selection"
              value={
                cover.selection ? 'Custom photo' : 'Editorial illustration'
              }
            />
          </dl>
          <div className={styles.cleanCanvas}>
            <CheckCheck size={20} aria-hidden="true" />
            <p>
              <strong>A fresh start for your plans</strong>
              <span>
                No events or tasks are added automatically. You choose what
                comes next.
              </span>
            </p>
          </div>
        </section>
        <section
          className={styles.nextSteps}
          aria-labelledby="next-steps-heading"
        >
          <h2 id="next-steps-heading" className={styles.eyebrow}>
            <Sparkles size={15} aria-hidden="true" /> After setup
          </h2>
          <p className={styles.description}>
            The next planning features are coming soon:
          </p>
          <ul>
            {nextActions.map(([, title]) => (
              <li key={title}>
                <Check size={14} aria-hidden="true" />
                {title}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  );
}

function ReviewHeading({ number, id, title, description, onEdit, editLabel }) {
  return (
    <div className={styles.reviewHeading}>
      <div className={styles.numberedHeading}>
        <span className={styles.sectionNumber}>{number}</span>
        <div>
          <h2 id={id}>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={styles.editButton}
        aria-label={editLabel}
      >
        <Pencil size={14} aria-hidden="true" />
        <span>Edit details</span>
      </button>
    </div>
  );
}
function Detail({ label, value, note }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note && <dd className={styles.detailNote}>{note}</dd>}
    </div>
  );
}
function Recap({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function SetupComplete({ wedding, headingRef }) {
  const router = useRouter();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) router.push('/dashboard');
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.completeOverlay} />
        <Dialog.Content
          className={styles.complete}
          aria-labelledby="complete-heading"
          aria-describedby="complete-description"
        >
          <div className={styles.completeHero}>
            <div className={styles.completeBrand}>
              <Brand href="/" className="!w-24 brightness-0 invert" />
              <span>Launchpad activated</span>
            </div>
            <Dialog.Close
              className={styles.completeClose}
              aria-label="Close confirmation and enter workspace"
            >
              <X size={20} />
            </Dialog.Close>
            <p className={styles.completeLabel}>
              <PartyPopper size={15} aria-hidden="true" /> Your wedding
              workspace is ready!
            </p>
            <Dialog.Title asChild>
              <h1
                id="complete-heading"
                ref={headingRef}
                tabIndex={-1}
                className={`${styles.heading} ${styles.completeTitle}`}
              >
                Welcome to {wedding.name}
              </h1>
            </Dialog.Title>
            <p id="complete-description">
              Your celebration on{' '}
              <strong>{weddingDate(wedding.mainDate)}</strong> in{' '}
              <strong>{wedding.location.city}</strong> has a place to begin.
            </p>
          </div>
          <div className={styles.completeBody}>
            <p className={styles.eyebrow}>Your next chapter</p>
            <h2>You’re the Admin of your wedding workspace.</h2>
            <p className={styles.description}>
              Your details are saved. Start with a clean canvas and build your
              plans together as each feature arrives.
            </p>
            <div className={styles.launchGrid}>
              {nextActions.map(([Icon, title, description]) => (
                <button
                  type="button"
                  disabled
                  key={title}
                  className={styles.launchCard}
                >
                  <Icon size={23} aria-hidden="true" />
                  <strong>{title}</strong>
                  <span>{description}</span>
                  <span className={styles.comingSoon}>Coming soon</span>
                </button>
              ))}
            </div>
            <div className={styles.completeFooter}>
              <span>
                <Heart size={15} aria-hidden="true" /> A little more organized.
              </span>
              <Link href="/dashboard" className={styles.primaryButton}>
                Enter your workspace <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
