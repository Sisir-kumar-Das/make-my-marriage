'use client';
import { useSyncExternalStore } from 'react';
import { readInvitation } from './invitation-data';
const subscribe = (notify) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};
export function useInvitationContext(name = 'invite') {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return readInvitation(hash, name);
}
