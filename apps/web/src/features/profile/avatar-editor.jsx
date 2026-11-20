'use client';

import Image from 'next/image';
import { Camera, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from '@/features/dashboard/workspace-ui.module.css';
import { apiRequest } from '@/lib/api-client';
import {
  defaultFrame,
  draggedFrame,
  frameStyle,
} from '@/features/weddings/cover-data';
import { performCoverUpload } from '@/features/weddings/cover-upload';
import { AvatarPhoto, initials, useAvatarPhoto } from './avatar-photo';

const types = ['image/jpeg', 'image/png', 'image/webp'];
const endpoint = '/users/me/profile-image';

export function AvatarEditor({ user, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [image, setImage] = useState(null);
  const [frame, setFrame] = useState(defaultFrame);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(null);
  const input = useRef(null);
  const drag = useRef(null);
  const controller = useRef(null);
  const receipt = useRef(null);
  const [submitted, setSubmitted] = useState(null);
  const photo = useAvatarPhoto(user.avatar, user.id);
  const draftUrl = draft?.url;

  useEffect(
    () => () => {
      if (draftUrl) URL.revokeObjectURL(draftUrl);
    },
    [draftUrl],
  );
  useEffect(() => () => controller.current?.abort(), []);

  function reset() {
    setDraft(null);
    setImage(null);
    setFrame(defaultFrame);
    setError('');
    setProgress(null);
    setConfirmRemoval(false);
    receipt.current = null;
    setSubmitted(null);
  }

  function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || controller.current) return;
    reset();
    setNotice('');
    if (!types.includes(file.type) || !file.size || file.size > 10_000_000) {
      setError('Choose a JPG, PNG or WebP photo up to 10 MB.');
      return;
    }
    setDraft({
      file,
      url: URL.createObjectURL(file),
      version: user.avatarVersion ?? 0,
    });
  }

  async function save(remove = false) {
    if (controller.current || (!remove && (!draft || !image))) return;
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const mediaId = remove
        ? null
        : await performCoverUpload({
            receipt,
            file: draft.file,
            base: '/media/profile-avatar',
            signal: active.signal,
            onProgress: setProgress,
          });
      if (active.signal.aborted) return;
      const body = submitted ?? {
        accountId: user.id,
        mediaId,
        version: remove ? confirmRemoval.version : draft.version,
        ...(!remove && { frame }),
      };
      setSubmitted(body);
      const { data } = await apiRequest(endpoint, {
        method: remove ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: active.signal,
      });
      if (active.signal.aborted || data.id !== user.id) return;
      onSaved(data);
      reset();
      setNotice(remove ? 'Profile photo removed.' : 'Profile photo saved.');
    } catch (failure) {
      if (!active.signal.aborted) {
        setError(failure.message);
        setProgress(null);
        if (failure.code === 'INVALID_AVATAR') setImage(null);
        if (
          ['AVATAR_CHANGED', 'MEDIA_NOT_FOUND', 'UPLOAD_EXPIRED'].includes(
            failure.code,
          )
        ) {
          setSubmitted(null);
          receipt.current = null;
          if (failure.code === 'AVATAR_CHANGED') {
            setDraft(null);
            setConfirmRemoval(false);
          }
        }
      }
    } finally {
      if (controller.current === active) controller.current = null;
      if (!active.signal.aborted) setPending(false);
    }
  }

  const lockedFrame = pending || !!submitted;
  return (
    <div className={`${styles.soft} mb-8`}>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0" aria-hidden="true">
          <span className="relative grid size-24 place-items-center overflow-hidden rounded-full bg-secondary text-2xl font-semibold text-primary shadow-inner">
            {initials(user.displayName)}
            <AvatarPhoto photo={photo} frame={user.avatar?.frame} />
          </span>
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-primary text-white">
            <Camera size={16} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2>Avatar &amp; Photo Monogram</h2>
            <span className={styles.soon}>Visible to Team</span>
          </div>
          <p className={styles.description}>
            Upload a JPG, PNG or WebP up to 10 MB.
          </p>
          <input
            ref={input}
            type="file"
            accept={types.join(',')}
            hidden
            onChange={choose}
          />
          <div className={`${styles.actions} mt-3`}>
            <button
              type="button"
              className={`${styles.action} ${styles.primary}`}
              disabled={pending || !!confirmRemoval}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} /> Upload New Photo
            </button>
            <button
              type="button"
              className={styles.action}
              disabled={!user.avatar || pending || !!draft || !!confirmRemoval}
              onClick={() => {
                setNotice('');
                setError('');
                setConfirmRemoval({ version: user.avatarVersion ?? 0 });
              }}
            >
              <Trash2 size={16} /> Remove Photo
            </button>
          </div>
        </div>
      </div>
      {draft && (
        <div className="mt-5 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div
            className="relative size-28 touch-none overflow-hidden rounded-full bg-secondary"
            role="group"
            aria-label="Position photo preview"
            tabIndex={lockedFrame ? -1 : 0}
            onPointerDown={(event) => {
              if (lockedFrame || !image || drag.current || event.button !== 0)
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                frame,
              };
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || start.id !== event.pointerId || lockedFrame) return;
              setFrame(
                draggedFrame(
                  start.frame,
                  event.currentTarget.getBoundingClientRect(),
                  image,
                  event.clientX - start.x,
                  event.clientY - start.y,
                ),
              );
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const offset = {
                ArrowLeft: [-8, 0],
                ArrowRight: [8, 0],
                ArrowUp: [0, -8],
                ArrowDown: [0, 8],
              }[event.key];
              if (!offset || lockedFrame || !image) return;
              event.preventDefault();
              setFrame(
                draggedFrame(
                  frame,
                  event.currentTarget.getBoundingClientRect(),
                  image,
                  ...offset,
                ),
              );
            }}
          >
            <Image
              key={draft.url}
              src={draft.url}
              alt="Profile photo preview"
              fill
              unoptimized
              draggable={false}
              className="object-cover"
              style={frameStyle(frame)}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } =
                  event.currentTarget;
                if (!width || !height || width * height > 40_000_000) {
                  setError('Choose a photo up to 40 megapixels.');
                  return;
                }
                setImage({ width, height });
              }}
              onError={() =>
                setError(
                  'This photo could not be opened. Choose another image.',
                )
              }
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm">
              Drag the photo or use the arrow keys to position it.
            </p>
            <label className="mt-3 grid gap-1 text-sm">
              Zoom
              <input
                className="min-h-11 w-full accent-primary"
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={frame.zoom}
                disabled={lockedFrame || !image}
                onChange={(event) =>
                  setFrame({ ...frame, zoom: Number(event.target.value) })
                }
              />
            </label>
            <div className={`${styles.actions} mt-3`}>
              <button
                type="button"
                className={`${styles.action} ${styles.primary}`}
                disabled={pending || !image}
                onClick={() => void save()}
              >
                {pending
                  ? 'Saving…'
                  : error && image
                    ? 'Retry upload'
                    : 'Use photo'}
              </button>
              <button
                type="button"
                className={styles.action}
                disabled={pending}
                onClick={reset}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmRemoval && (
        <div className="mt-3">
          <p className="text-sm">
            Remove your profile photo and show your initials?
          </p>
          <div className={`${styles.actions} mt-2`}>
            <button
              type="button"
              className={`${styles.action} ${styles.primary}`}
              disabled={pending}
              onClick={() => void save(true)}
            >
              {pending ? 'Removing…' : 'Remove photo'}
            </button>
            <button
              type="button"
              className={styles.action}
              disabled={pending}
              onClick={reset}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {progress && pending && (
        <p className="mt-3 text-sm" role="status">
          {progress.phase} · {progress.percent}%
        </p>
      )}
      {notice && (
        <p className="mt-3 text-sm text-primary" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
