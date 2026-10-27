'use client';

import { useRef } from 'react';
import { AlertDialog } from 'radix-ui';
import { AlertTriangle } from 'lucide-react';
import styles from './tasks.module.css';

export function DiscardChangesDialog({
  open,
  pending,
  title,
  onKeepEditing,
  onDiscard,
}) {
  const returnFocus = useRef(null);
  const confirmed = useRef(false);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onKeepEditing();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.confirmationOverlay} />
        <AlertDialog.Content
          className={styles.confirmation}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement;
            confirmed.current = false;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!confirmed.current && returnFocus.current?.isConnected)
              returnFocus.current.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!pending) onKeepEditing();
          }}
        >
          <span className={styles.confirmationIcon} aria-hidden="true">
            <AlertTriangle size={22} />
          </span>
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>
            Your changes have not been saved. Keep editing to finish your task,
            or discard these changes to continue.
          </AlertDialog.Description>
          <div className={styles.confirmationActions}>
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className={styles.secondary}
                disabled={pending}
              >
                Keep editing
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className={styles.primary}
              disabled={pending}
              onClick={() => {
                if (pending) return;
                confirmed.current = true;
                onDiscard();
              }}
            >
              Discard changes
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
