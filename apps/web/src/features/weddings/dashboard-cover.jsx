'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useCoverUpload } from './use-cover-upload';
import { CoverEditor } from './cover-editor';
import { frameStyle } from './cover-data';
import styles from './cover.module.css';

function CoverLoading({ failed = false }) {
  return (
    <div className={styles.coverLoading} role={failed ? undefined : 'status'}>
      {!failed && (
        <LoaderCircle size={22} className={styles.spinner} aria-hidden="true" />
      )}
      <span>
        {failed
          ? 'Your saved photo is temporarily unavailable.'
          : 'Loading your wedding cover…'}
      </span>
    </div>
  );
}

function SavedCoverPhoto({ source, frame, onError }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Image
        src={source}
        alt="Your wedding cover"
        fill
        loading="eager"
        unoptimized
        sizes="(min-width: 1024px) calc(100vw - 320px), 100vw"
        className={styles.photo}
        style={{ ...frameStyle(frame), opacity: loaded ? 1 : 0 }}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={onError}
      />
      {!loaded && <CoverLoading />}
    </>
  );
}

export function DashboardCover({
  wedding,
  membership,
  children,
  readOnly = false,
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [link, setLink] = useState(null);
  const [retry, setRetry] = useState(0);
  const shown =
    saved?.id === wedding.id && saved.version >= wedding.version
      ? saved
      : wedding;
  const cover = useCoverUpload({ weddingId: wedding.id });
  const mediaId = shown.coverMediaId;
  useEffect(() => {
    if (!mediaId) return;
    const controller = new AbortController();
    apiRequest(`/weddings/${wedding.id}/media/${mediaId}`, {
      signal: controller.signal,
      timeoutMs: 15000,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setLink({ weddingId: wedding.id, mediaId, url: result.data.url });
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setLink({ weddingId: wedding.id, mediaId, error: failure.message });
      });
    const timer = setInterval(() => setRetry((value) => value + 1), 240000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [mediaId, wedding.id, retry]);
  const currentLink =
    link?.weddingId === wedding.id && link?.mediaId === mediaId ? link : null;
  async function save(remove = false) {
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('');
    setConflict(false);
    try {
      const id = remove ? null : await cover.upload();
      if (!remove && !id) throw new Error('Choose a photo before saving.');
      const result = await apiRequest(`/weddings/${wedding.id}/cover-image`, {
        method: remove ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 20000,
        body: JSON.stringify({
          mediaId: id,
          frame: cover.frame,
          version: shown.version,
        }),
      });
      setSaved(result.data.wedding);
      setOpen(false);
      cover.reset();
      setNotice(
        remove ? 'Signature cover restored.' : 'Your wedding cover is saved.',
      );
      router.refresh();
    } catch (failure) {
      setError(failure.message);
      setConflict(failure.code === 'VERSION_CONFLICT');
      if (failure.code === 'COVER_NOT_READY') cover.invalidate();
    } finally {
      setPending(false);
    }
  }
  async function reload() {
    setPending(true);
    try {
      const result = await apiRequest(`/weddings/${wedding.id}`);
      setSaved(result.data.wedding);
      setConflict(false);
      setError('');
      setNotice(
        'Current cover loaded. Review it before saving your selection.',
      );
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className={children ? styles.presentation : undefined}>
        {children}
        <div className={styles.coverPane}>
          <div className={styles.frame}>
            {mediaId ? (
              currentLink?.url ? (
                <SavedCoverPhoto
                  key={`${wedding.id}/${mediaId}/${currentLink.url}`}
                  source={currentLink.url}
                  frame={shown.coverFrame}
                  onError={() =>
                    setLink((current) =>
                      current === currentLink
                        ? {
                            weddingId: wedding.id,
                            mediaId,
                            error:
                              'Your photo could not be loaded. Please retry.',
                          }
                        : current,
                    )
                  }
                />
              ) : (
                <CoverLoading failed={!!currentLink?.error} />
              )
            ) : (
              <Image
                src="/images/sample-couple.webp"
                alt="Default wedding cover"
                fill
                loading="eager"
                sizes="(min-width: 1024px) calc(100vw - 320px), 100vw"
                className={styles.photo}
                style={{ objectPosition: 'center 25%' }}
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs text-primary">
                {mediaId ? 'Your wedding cover' : 'Signature cover'}
              </span>
              {membership.role === 'ADMIN' && !readOnly && (
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-primary shadow-sm"
                  disabled={pending}
                  onClick={() => {
                    setOpen(!open);
                    setError('');
                  }}
                >
                  Change cover
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {mediaId && currentLink?.error && (
        <p role="alert" className={styles.error}>
          Your saved photo is temporarily unavailable.{' '}
          <button
            type="button"
            onClick={() => {
              setLink(null);
              setRetry((value) => value + 1);
            }}
            className="underline"
          >
            Retry loading photo
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="px-5 pt-4 text-sm text-primary">
          {notice}
        </p>
      )}
      {open && membership.role === 'ADMIN' && !readOnly && (
        <section
          className={styles.manage}
          aria-labelledby="change-cover-heading"
        >
          <div className={styles.manageHeader}>
            <h2 id="change-cover-heading">Make this space yours.</h2>
            <span className={styles.hint}>
              Only wedding members can view your photo.
            </span>
          </div>
          <fieldset disabled={pending}>
            <CoverEditor cover={cover} disabled={pending} />
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {conflict && (
              <button
                type="button"
                className={styles.secondary}
                onClick={reload}
              >
                Reload current cover
              </button>
            )}
            <div className={styles.manageActions}>
              <button
                type="button"
                className={styles.save}
                disabled={
                  pending || !cover.selection || !!cover.error || conflict
                }
                onClick={() => save(false)}
              >
                {pending ? 'Saving your cover…' : 'Save wedding cover'}
              </button>
              {mediaId && (
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={pending || conflict}
                  onClick={() => save(true)}
                >
                  Remove photo · use signature cover
                </button>
              )}
              <button
                type="button"
                className={styles.secondary}
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  cover.reset();
                  setError('');
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </section>
      )}
    </>
  );
}
