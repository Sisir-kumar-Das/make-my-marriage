'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Camera, Check, Expand, LoaderCircle, X } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useCoverUpload } from './use-cover-upload';
import { CoverEditor } from './cover-editor';
import {
  coverActions,
  frameStyle,
  onContainedPicture,
  sameMenuPress,
  viewerPressCloses,
} from './cover-data';
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

// The signed photo link is refreshed every 4 minutes. Once a photo is on screen, a refreshed
// link loads in a hidden layer and becomes the visible one only when it has loaded (the same
// element, so the photo is downloaded once). If the refreshed link fails, the photo already
// shown stays and the next refresh tries again. Only a failure of the photo actually on screen
// (or of the very first load) shows the "temporarily unavailable" state with its Retry; if a
// newer link is already loading when the shown photo breaks, that one takes over instead.
function SavedCoverPhoto({ source, frame, onError, onReady }) {
  const [shown, setShown] = useState(null);
  const [failed, setFailed] = useState(null);
  const pending = source !== shown && source !== failed ? source : null;
  const layers = [shown, pending].filter(Boolean);
  return (
    <>
      {layers.map((url) => (
        <Image
          key={url}
          src={url}
          alt={url === shown ? 'Your wedding cover' : ''}
          aria-hidden={url === shown ? undefined : 'true'}
          fill
          loading="eager"
          unoptimized
          sizes="(min-width: 1024px) calc(100vw - 320px), 100vw"
          className={styles.photo}
          style={{ ...frameStyle(frame), opacity: url === shown ? 1 : 0 }}
          referrerPolicy="no-referrer"
          onLoad={() => {
            if (url === shown) return;
            setShown(url);
            onReady?.(url);
          }}
          onError={() => {
            if (url === shown) {
              if (pending) setShown(null);
              else onError();
            } else if (!shown) onError();
            else setFailed(url);
          }}
        />
      ))}
      {!shown && <CoverLoading />}
    </>
  );
}

// Owner decision, 4 Nov (not in Stitch): on the dashboard banner the cover works like a
// profile photo. Hover (always shown on touch screens) reveals a small corner icon; clicking
// the photo opens a menu. Everyone can View photo when a custom photo is loaded; only Admins
// get Change cover. The signature artwork has no View photo.
function CoverMenu({
  canView,
  canChange,
  changeDisabled,
  onView,
  onChange,
  onEditorFocus,
  iconRef,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // The items the menu opened with stay fixed until it closes: if the photo finishes loading
  // while the menu is open, "View photo" must not be inserted above the highlighted item (the
  // keyboard selection would shift onto the wrong action).
  const [openedWith, setOpenedWith] = useState(null);
  const toEditor = useRef(false);
  // The press that dismissed the menu (by its time stamp) and the latest press on the photo.
  const closingPress = useRef(-1);
  const photoPress = useRef(-2);
  const openMenu = (next) => {
    setOpenedWith(next ? { canView, canChange } : null);
    setMenuOpen(next);
  };
  // If the photo becomes unavailable while the menu is open, the menu closes rather than offer
  // a View photo that would do nothing.
  if (menuOpen && openedWith?.canView && !canView) {
    setMenuOpen(false);
    setOpenedWith(null);
  }
  const shown = menuOpen && openedWith ? openedWith : { canView, canChange };
  if (!shown.canView && !shown.canChange) return null;
  const label = shown.canChange ? 'Cover photo options' : 'View cover photo';
  const Icon = shown.canChange ? Camera : Expand;
  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={openMenu}>
      {/* Clicking anywhere on the photo opens the menu; the corner icon is the keyboard stop.
          The click that ends the same press which dismissed the menu does not reopen it. */}
      <div
        className={styles.coverHit}
        aria-hidden="true"
        onPointerDown={(event) => {
          photoPress.current = event.timeStamp;
        }}
        onClick={() => {
          if (!sameMenuPress(photoPress.current, closingPress.current))
            openMenu(true);
        }}
      />
      <DropdownMenu.Trigger asChild>
        <button
          ref={iconRef}
          type="button"
          className={styles.coverIcon}
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.coverMenu}
          align="end"
          sideOffset={6}
          onPointerDownOutside={(event) => {
            closingPress.current = event.detail.originalEvent.timeStamp;
          }}
          onCloseAutoFocus={(event) => {
            // Change cover moves focus into the editor instead of back to the icon. This runs
            // after the menu has closed, so its focus trap can no longer take focus back.
            if (!toEditor.current) return;
            toEditor.current = false;
            event.preventDefault();
            onEditorFocus();
          }}
        >
          {shown.canView && (
            <DropdownMenu.Item
              className={styles.coverMenuItem}
              onSelect={onView}
            >
              <Expand size={16} aria-hidden="true" />
              View photo
            </DropdownMenu.Item>
          )}
          {shown.canChange && (
            <DropdownMenu.Item
              className={styles.coverMenuItem}
              disabled={changeDisabled}
              onSelect={() => {
                toEditor.current = true;
                onChange();
              }}
            >
              <Camera size={16} aria-hidden="true" />
              Change cover
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// Stitch toast (Members page): fixed bottom-right card with a plum check, title and line.
// Owner, 4 Nov: it disappears after 2 seconds; on phones it sits bottom-centre.
const toastMs = 2000;
export function CoverToast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDone, toastMs);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <>
      {/* Always-present live region: screen readers announce text added to an existing region
          reliably; the visual card itself is hidden from them to avoid a double reading. */}
      <p className="sr-only" role="status" aria-live="polite">
        {toast ? `${toast.title}. ${toast.text}${toast.marker || ''}` : ''}
      </p>
      {toast &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={styles.toast} aria-hidden="true">
            <span className={styles.toastIcon}>
              <Check size={18} />
            </span>
            <span className={styles.toastText}>
              <strong>{toast.title}</strong>
              <span>{toast.text}</span>
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}

// True when a click lands on the visible picture inside an object-fit: contain image.
function onPicture(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return false;
  return onContainedPicture(
    image.getBoundingClientRect(),
    { width: image.naturalWidth, height: image.naturalHeight },
    { x: event.clientX, y: event.clientY },
  );
}

// Photo links last 5 minutes. If the full photo fails to load (for example its link expired
// after a failed refresh), the viewer fetches a fresh link once by itself; if that also fails
// it says so and offers Retry, never a broken image.
function CoverViewer({
  open,
  source,
  status,
  onImageError,
  onRetry,
  onOpenChange,
  returnFocusRef,
}) {
  // A drag or text selection that starts or ends on the picture must not close the viewer.
  const press = useRef({ down: false, up: false });
  // When the photo can't be loaded, keyboard focus moves to Retry.
  const retryRef = useRef(null);
  useEffect(() => {
    if (open && status === 'failed') retryRef.current?.focus();
  }, [open, status]);
  // Touch keeps sending events to the element first pressed, so the lift is checked against
  // the element actually under the finger or pointer.
  // The loading / "couldn't load" panel counts like the picture: clicking it never closes.
  const outside = (event, target = event.target) =>
    !target.closest('button') &&
    !target.closest('[data-viewer-message]') &&
    !onPicture({ target, clientX: event.clientX, clientY: event.clientY });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.viewerOverlay} />
        <Dialog.Content
          className={styles.viewer}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // The viewer has no trigger of its own; focus goes back to the cover icon.
            event.preventDefault();
            returnFocusRef.current?.focus({ preventScroll: true });
          }}
          // A click on the dark area around the picture closes the viewer, only when the press
          // both started and ended there.
          onPointerDown={(event) => {
            press.current = { down: outside(event), up: false };
          }}
          onPointerUp={(event) => {
            press.current.up = outside(
              event,
              document.elementFromPoint(event.clientX, event.clientY) ||
                event.target,
            );
          }}
          onClick={(event) => {
            const close = viewerPressCloses({
              ...press.current,
              onButton: !!event.target.closest('button'),
            });
            press.current = { down: false, up: false };
            if (close) onOpenChange(false);
          }}
        >
          <Dialog.Title className="sr-only">Wedding cover photo</Dialog.Title>
          <div className={styles.viewerImage}>
            {status === 'ok' && source && (
              <Image
                key={source}
                src={source}
                alt="Your wedding cover, full photo"
                fill
                unoptimized
                sizes="90vw"
                className={styles.viewerPhoto}
                referrerPolicy="no-referrer"
                onError={onImageError}
              />
            )}
            {status === 'loading' && (
              <p
                className={styles.viewerMessage}
                role="status"
                data-viewer-message=""
              >
                <LoaderCircle
                  size={22}
                  className={styles.spinner}
                  aria-hidden="true"
                />
                Loading the full photo…
              </p>
            )}
            {status === 'failed' && (
              <div
                className={styles.viewerMessage}
                role="alert"
                data-viewer-message=""
              >
                <p>Couldn&apos;t load the full photo.</p>
                <button
                  ref={retryRef}
                  type="button"
                  className={styles.viewerRetry}
                  onClick={onRetry}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              className={styles.viewerClose}
              aria-label="Close photo"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  const [toast, setToast] = useState(null);
  const toastCount = useRef(0);
  const [notice, setNotice] = useState('');
  const editorHeading = useRef(null);
  const noticeRef = useRef(null);
  const [conflict, setConflict] = useState(false);
  const [link, setLink] = useState(null);
  const [retry, setRetry] = useState(0);
  // The last photo that actually loaded, per wedding + photo. The viewer keeps using it while
  // a refreshed signed link loads, so it never flickers closed every 4 minutes.
  const [ready, setReady] = useState(null);
  const [viewing, setViewing] = useState(false);
  // The viewer's own recovery when its photo fails: status ok | loading | failed, plus the
  // fresh link it fetched (if any).
  const [viewerFix, setViewerFix] = useState({ status: 'ok', url: null });
  // Each viewer opening or recovery attempt gets a number; a late answer from an older one is
  // ignored, so it can never change a viewer opened afterwards.
  const viewerAttempt = useRef(0);
  const coverIcon = useRef(null);
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
        if (controller.signal.aborted) return;
        // A failed 4-minute refresh keeps the working link (the photo stays on screen); only
        // a failure with no working link shows the "temporarily unavailable" state.
        setLink((previous) =>
          previous?.url &&
          previous.weddingId === wedding.id &&
          previous.mediaId === mediaId
            ? previous
            : { weddingId: wedding.id, mediaId, error: failure.message },
        );
      });
    const timer = setInterval(() => setRetry((value) => value + 1), 240000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [mediaId, wedding.id, retry]);
  const currentLink =
    link?.weddingId === wedding.id && link?.mediaId === mediaId ? link : null;
  // View photo only once the current photo has actually loaded.
  const photoUrl =
    ready?.weddingId === wedding.id &&
    ready?.mediaId === mediaId &&
    !currentLink?.error
      ? ready.url
      : null;
  // If the photo becomes unavailable while the viewer is open, the viewer closes for good; it
  // must not pop open again by itself when the photo recovers later.
  if (viewing && !photoUrl) setViewing(false);
  const { canView, canChange } = coverActions({
    role: membership.role,
    readOnly,
    hasPhoto: !!mediaId,
    photoReady: !!photoUrl,
  });
  const clearToast = useCallback(() => setToast(null), []);
  // After Change cover (also when the editor is already open), bring the editor into view and
  // move focus to its heading, so phones (editor below the fold) and keyboard users see it.
  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => {
      const heading = editorHeading.current;
      if (!heading) return;
      const still = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      heading.scrollIntoView({
        block: 'start',
        behavior: still ? 'auto' : 'smooth',
      });
      heading.focus({ preventScroll: true });
    });
  }, []);
  // The "Current cover loaded" note can sit below the fold on phones: bring it into view.
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'center' });
  }, [notice]);
  async function recoverViewer() {
    const attempt = ++viewerAttempt.current;
    setViewerFix({ status: 'loading', url: null });
    try {
      const result = await apiRequest(
        `/weddings/${wedding.id}/media/${mediaId}`,
        {
          timeoutMs: 15000,
        },
      );
      const url = result.data.url;
      // The banner picks up the fresh link too (it swaps in once loaded).
      // Never overwrite the link of a different photo saved meanwhile.
      setLink((previous) =>
        previous && previous.mediaId !== mediaId
          ? previous
          : { weddingId: wedding.id, mediaId, url },
      );
      if (attempt === viewerAttempt.current)
        setViewerFix({ status: 'ok', url });
    } catch {
      if (attempt === viewerAttempt.current)
        setViewerFix({ status: 'failed', url: null });
    }
  }
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
      // Every other toast ends with a non-breaking space (not read aloud), so the same words
      // twice in a row are still a change screen readers announce.
      toastCount.current += 1;
      setToast({
        ...(remove
          ? {
              title: 'Signature cover restored',
              text: 'Your photo was removed.',
            }
          : { title: 'Cover saved', text: 'Your wedding cover is updated.' }),
        marker: toastCount.current % 2 ? '' : '\u00a0',
      });
      // The editor (and the button that had focus) is gone; return focus to the cover icon.
      window.requestAnimationFrame(() => coverIcon.current?.focus());
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
                  key={`${wedding.id}/${mediaId}`}
                  source={currentLink.url}
                  frame={shown.coverFrame}
                  onReady={(url) =>
                    setReady({ weddingId: wedding.id, mediaId, url })
                  }
                  onError={() =>
                    setLink((current) =>
                      current?.weddingId === wedding.id &&
                      current?.mediaId === mediaId
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
            {/* ADR-044 (owner, 3 Nov): no fade and no cover label on the dashboard banner. */}
            {children ? (
              <CoverMenu
                canView={canView}
                canChange={canChange}
                changeDisabled={pending}
                iconRef={coverIcon}
                onView={() => {
                  viewerAttempt.current += 1;
                  setViewerFix({ status: 'ok', url: null });
                  setViewing(true);
                }}
                onChange={() => {
                  setOpen(true);
                  setError('');
                }}
                onEditorFocus={focusEditor}
              />
            ) : (
              <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1.5 text-xs text-primary">
                {mediaId ? 'Your wedding cover' : 'Signature cover'}
              </span>
            )}
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
      <CoverToast toast={toast} onDone={clearToast} />
      <CoverViewer
        open={viewing && !!photoUrl}
        source={viewerFix.url || photoUrl}
        status={viewerFix.status}
        onImageError={() =>
          // One automatic fresh link; a second failure (of the fresh link) shows Retry.
          viewerFix.url
            ? setViewerFix({ status: 'failed', url: null })
            : recoverViewer()
        }
        onRetry={recoverViewer}
        onOpenChange={setViewing}
        returnFocusRef={coverIcon}
      />
      {open && membership.role === 'ADMIN' && !readOnly && (
        <section
          className={styles.manage}
          aria-labelledby="change-cover-heading"
        >
          <div className={styles.manageHeader}>
            <h2 id="change-cover-heading" ref={editorHeading} tabIndex={-1}>
              Make this space yours.
            </h2>
            <span className={styles.hint}>
              Only wedding members can view your photo.
            </span>
          </div>
          <fieldset disabled={pending}>
            <CoverEditor cover={cover} disabled={pending} />
            {notice && (
              <p
                ref={noticeRef}
                role="status"
                className="mt-3 text-sm text-primary"
              >
                {notice}
              </p>
            )}
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
                  setNotice('');
                  // A conflict belongs to this editing attempt; reopening starts fresh.
                  setConflict(false);
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
