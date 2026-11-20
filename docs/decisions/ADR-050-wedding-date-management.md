# ADR-050 — Wedding date management

Date: 12 November 2026

Status: Owner approved the date rules, centered confirmation and implementation. Verification and owner acceptance are tracked separately in PROJECT_STATUS.

## Scope and owner decisions

Extend ADR-049's Wedding Settings form with Admin-only Main Wedding Date editing. A changed date must be today or later in Asia/Kolkata; an unchanged historical wedding date remains valid for other metadata edits. Store the real calendar date as YYYY-MM-DD, never as an inferred UTC instant. Country and timezone remain fixed.

Use the existing Save Wedding Settings action. When the date changes, show the old saved date, proposed date and warnings in the same centered AlertDialog presentation used by Tasks and Events discard confirmations. The owner explicitly approved this addition to Stitch's existing date field. Keep editing closes confirmation and preserves every draft field. Confirm and save commits all edited settings together. Trap focus, restore it on cancellation, prevent Escape/dismissal and duplicate confirmation while a save is pending, and keep recovery feedback accessible. See STITCH_DEPARTURES.

The saved wedding date updates the current workspace overview, header/sidebar date and countdown through the existing session update/revalidation channel. It does not move ceremony dates/activities, task deadlines, recurring schedules/end dates or previously generated checklist deadlines. Repeats keep their saved end even if a wedding is postponed. Explain that repeats extending beyond the new date must be reviewed separately in Tasks; there is no automatic extension, truncation or backfill.

New checklist previews use the newly saved wedding date. Existing generated tasks and immutable generation history retain their dates and identities. Regeneration still preserves existing/edited/completed/deleted items and never duplicates them. This increment does not add schedule migration or new activity-feed categories.

## Express contract and retry boundary

Extend the current protected PATCH /api/v1/weddings/:weddingId with mainDate and a literal confirmDateChange: true acknowledgement. The acknowledgement is required with a date and rejected without one; it is part of the normalized request hash but never persisted as wedding metadata. The quoted If-Match version fixes the saved date/other fields that were reviewed. Existing current verified active Admin/account/wedding checks, transaction locks, exact actor/wedding/key-scoped 24-hour receipts, no-op behavior and private WEDDING_UPDATED audit remain.

Static calendar validation happens before database access. Inside the transaction, revalidate current authorization and replay a matching unexpired receipt before relative-date/version checks. A fresh changed date is compared with the India day at transaction time. An unchanged existing past date is allowed. This lets a successful today-date save with a lost response recover after midnight while rejecting a new past-date mutation. A conflicting receipt/body/version never changes data. Date, other edited fields, wedding version, audit and receipt remain atomic.

The client validates a fresh date both before opening confirmation and immediately before first dispatch, since midnight may pass while the popup is open. After an uncertain response it retains the exact original body/version/key and sends that operation directly without fresh date validation or another confirmation. Express alone decides whether it can replay the completed operation or must reject a new past-date write. A confirmed terminal rejection releases the operation; a recoverable session/network error keeps the draft and retry. Confirmed account/wedding/permission changes still reset the scoped form and reject stale callbacks.

Concurrent Admin/settings/cover edits use the existing wedding version; stale changes cannot silently overwrite one another. Date changes do not add writes to planning collections. The warning is unconditional and does not claim a counted or migrated set of affected records.

## Boundaries and verification

No schema migration, dependency, credential, mail, R2, hosting or production scheduler change is needed. Root-helper deployment packaging remains pending under ADR-049. Settings cover/overview integration and Wedding Recovery remain following increments; neither is included. Commit/push, deployment and restarting the owner's running servers require separate explicit authorization.

Use focused calendar/India-midnight/confirmation/retry tests, real local MongoDB for transactions/concurrency/planning preservation and rollback, then isolated production/browser checks at desktop and 390/320 px. Compare the date field with corrected Stitch Settings markup and the popup with Tasks/Events confirmation styles. Record actual evidence, tagged fixtures and owned-process cleanup in PROJECT_STATUS and AGENT_HANDOFF.

## Review follow-up — 13 November

The owner approved two narrow corrections after the independent review/manual reports. Closing a completed date confirmation focuses the current save-feedback message; a conflict focuses the enabled Discard draft and load latest control. Cancellation still returns to the original Save trigger. Messages are programmatically focusable without joining normal Tab order, and focus restoration never tries to focus a disabled trigger. Existing popup appearance, pending locks, drafts and retry semantics stay unchanged.

When strict validation produces both an unsupported-key issue and an empty-edit refinement at the same root path, keep the unsupported-key diagnostic. The main error message and its detail both explain that the field cannot be edited. Empty requests retain their existing choose-an-editable-detail message. This changes error wording only, not accepted fields or database behavior.

The reported date-field corner difference is not a mismatch: this corrected Stitch export defines rounded-xl as 0.5rem, matching the existing 8 px inputs. The reported 10-second Family view delay does not establish a refresh defect against the existing 60-second/focus recheck contract. No stream or new refresh behavior is added. The manual real-midnight crossing remains untested; controlled-clock native/database coverage is recorded separately. The independent Code Reviewer did not read all required context documents in that round, so that evidence is scoped to its stated diff/ADR/tests.

### Second focus follow-up — 13 November

Sisir approved the three remaining focus cases reported by Manual RUN 31 and the scoped reviewer: result focus after Load latest, fallback when recovery/retry controls are disabled, and a stable in-dialog target during pending saves. The latest-settings action requests one result focus after the response has rendered, using its success/error message; later background renders do not refocus it. Date-confirmation close targets try the enabled recovery/retry control, then the visible form error. Disconnected, disabled and inert descendants are excluded.

Real-browser outage testing found the preserved form is deliberately inert during a session-check failure, so even its error paragraph cannot receive focus. Keep that interaction protection. The existing SessionProvider connection alert outside the inert subtree now has a programmatic focus ref exposed through the existing Context; use it when the form targets are unavailable. No session check, authorization, expiry or draft-preservation behavior changes. The date dialog uses a layout effect to focus its existing content container while pending; disabled buttons, Escape/outside-click locks and exact retry operations remain intact.

The reported 2.5–3-second conflict delay is not accepted as a separate defect without response-relative timing. Browser probes should record response-to-focus latency separately from deliberate server delay. Check actual Tab/Shift+Tab/Escape, reload success/failure and combined outage/conflict/uncertain-write cases at desktop and phone widths. Backend/database behavior, presentation and date policy stay unchanged; record observed evidence and independent recheck status in PROJECT_STATUS.
