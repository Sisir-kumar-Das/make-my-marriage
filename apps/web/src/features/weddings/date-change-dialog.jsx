'use client';

import { useLayoutEffect, useRef } from 'react';
import { AlertDialog } from 'radix-ui';
import { AlertTriangle } from 'lucide-react';
import { weddingDate } from './form-data';
import styles from '../tasks/tasks.module.css';

// Reuse the exact Tasks/Events centered-confirmation presentation approved by
// the owner. This dialog confirms a Settings save, never a schedule migration.
export function DateChangeDialog({
  change,
  pending,
  connectionError,
  onCancel,
  onConfirm,
  getCloseFocus,
}) {
  const returnFocus = useRef(null);
  const content = useRef(null);
  const open = !!change;
  useLayoutEffect(() => {
    // Disabling the focused Confirm button removes the only usable focus
    // target. Keep the busy dialog itself focused until the request resolves.
    if (open && pending) content.current?.focus({ preventScroll: true });
  }, [open, pending]);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.confirmationOverlay} />
        <AlertDialog.Content
          ref={content}
          tabIndex={-1}
          className={styles.confirmation}
          aria-busy={pending}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const result = getCloseFocus?.();
            if (
              result?.isConnected &&
              !result.disabled &&
              !result.closest?.('[inert]')
            ) {
              result.focus();
              return;
            }
            if (
              returnFocus.current?.isConnected &&
              !returnFocus.current.disabled &&
              !returnFocus.current.closest?.('[inert]')
            )
              returnFocus.current.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!pending) onCancel();
          }}
        >
          <span className={styles.confirmationIcon} aria-hidden="true">
            <AlertTriangle size={22} />
          </span>
          <AlertDialog.Title>Change wedding date?</AlertDialog.Title>
          <AlertDialog.Description>
            The wedding overview and countdown will use the new date. All other
            edited wedding settings will be saved together.
          </AlertDialog.Description>
          {change && (
            <div className="grid gap-2 rounded-lg bg-[#f9f2f6] p-4 text-sm">
              <p>
                <span className="font-semibold">Current date: </span>
                {weddingDate(change.oldDate)}
              </p>
              <p>
                <span className="font-semibold">New date: </span>
                {weddingDate(change.newDate)}
              </p>
            </div>
          )}
          <p>
            Existing ceremony dates, task deadlines and generated checklist
            deadlines will stay unchanged. Repeating tasks keep their saved
            schedules and end dates; review them in Tasks if they extend beyond
            the new wedding date.
          </p>
          <p>
            New checklist previews use the new wedding date. Generating again
            will not move existing tasks or create duplicate items.
          </p>
          {connectionError && (
            <p role="alert">
              The connection needs checking before saving. Keep editing to
              return to the session Retry control. Your draft is kept.
            </p>
          )}
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
              disabled={pending || !!connectionError}
              onClick={() => {
                if (!pending && !connectionError) void onConfirm();
              }}
            >
              {pending ? 'Saving…' : 'Confirm and save'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
