'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { frameStyle } from '@/features/weddings/cover-data';

export { initials } from './avatar-data';

export function useAvatarPhoto(avatar, scope) {
  const mediaId = avatar?.mediaId;
  const key = mediaId ? `${scope}/${mediaId}` : null;
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let current;
    let sequence = 0;
    let pending = false;
    let retried = false;

    async function load() {
      pending = true;
      try {
        const { data } = await apiRequest(`/media/profile-avatar/${mediaId}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || data.mediaId !== mediaId) return;
        const grant = {
          key,
          sequence: ++sequence,
          url: data.url,
          onLoad() {
            if (current === grant && !pending) retried = false;
          },
          onError() {
            if (
              controller.signal.aborted ||
              current !== grant ||
              pending ||
              retried
            )
              return;
            retried = true;
            void load();
          },
        };
        current = grant;
        setResult(grant);
      } catch {
        if (!controller.signal.aborted) {
          current = null;
          setResult(null);
        }
      } finally {
        pending = false;
      }
    }

    void load();
    return () => controller.abort();
  }, [key, mediaId]);

  return key && result?.key === key ? result : null;
}

function LoadedAvatar({ photo, frame }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={photo.url}
      alt=""
      fill
      unoptimized
      loading="eager"
      draggable={false}
      referrerPolicy="no-referrer"
      className={`bg-secondary object-cover ${loaded ? '' : 'opacity-0'}`}
      style={frameStyle(frame)}
      onLoad={() => {
        setLoaded(true);
        photo.onLoad();
      }}
      onError={() => {
        setLoaded(false);
        photo.onError();
      }}
    />
  );
}

export function AvatarPhoto({ photo, frame }) {
  return photo ? (
    <LoadedAvatar
      key={`${photo.key}/${photo.sequence}`}
      photo={photo}
      frame={frame}
    />
  ) : null;
}

export function MemberAvatar({ avatar, scope }) {
  const photo = useAvatarPhoto(avatar, scope);
  return <AvatarPhoto photo={photo} frame={avatar?.frame} />;
}
