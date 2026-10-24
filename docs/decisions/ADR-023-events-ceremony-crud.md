# ADR-023: Events Step 1 — ceremony schedule and manual venues

Date: 24 October 2026

Status: Accepted for the owner-authorized first Events increment.

## Context

V1 requires ceremonies, venues, schedules and ceremony activities. The owner approved incremental delivery, past and future event dates, manual venue entry first and Google Places in a following Events increment **before closing Events and before V1 acceptance**. New-wedding setup still accepts today/future dates; existing weddings remain usable afterward. The corrected `make_my_marriage_events_ceremony_schedule_refined/code.html` export supplies the visual reference (ADR-021).

## Decision

- Step 1 implements chronological paginated list, details, creation and editing. Ceremony types are Engagement, Haldi, Mehendi, Sangeet, Barajatri, Wedding, Reception and Custom. Status is Planned, Confirmed, Completed or Cancelled. Names are required; descriptions and manual venue/name/address/city/state are optional. Manual directions use an encoded Google Maps search URL, never a caller-supplied redirect URL.
- The UI accepts local India dates/times and sends UTC instants; Express validates the resulting interval. End must follow start, including an explicit end date for overnight ceremonies. Past events and dates outside the main wedding date are allowed. Overlapping non-cancelled ceremonies return a non-blocking warning; adjacent intervals do not overlap. This warning is available when viewing or saving details, not invented readiness/task data.
- Express owns validation, current verified-user/active-member checks, wedding isolation and MongoDB access. Admin and Family Member can create/edit; Viewer can list/read. Keep both existing layout/page SSR guards. The web uses the same-origin API client/relay; it never imports API models. Mutations retain exact Origin, JSON, CSRF, cookie-session and rate-limit protection.
- Events use the approved `events` collection, soft-delete-compatible fields, actor/timestamps and optimistic `__v` versions. Every PATCH requires a strong numeric `If-Match` version; mismatches return 409 without overwriting newer work. The relay forwards `If-Match` and returns `ETag`.
- Each write requires a UUID `Idempotency-Key`. A private `eventWriteRequests` collection stores SHA-256 key/request hashes scoped to wedding and user for 24 hours, with a unique scoped key and TTL cleanup. The hash includes the normalized body, event ID and edit version. An unchanged retry returns the currently authorized saved event without repeating the mutation/history; reuse with different details returns 409. Expired receipts can be replaced before the TTL monitor runs. Refreshing/closing an unsaved editor loses its in-memory retry key; there is no persistent draft or indefinite deduplication promise.
- Event mutation, receipt and append-only `activities` entry commit in one transaction. History snapshots contain the event label and fixed action/entity/actor fields, with no arbitrary request payload. No activity-feed mutation API exists. An activity write failure rolls back the event too. Live dashboard/activity UI remains its later V1 increment.
- Writes touch the current user and membership inside the transaction to serialize eligibility/role changes. A dedicated wedding `eventRevision` serializes event writes and wedding deletion, making overlap warnings consistent under concurrency without changing the wedding cover/settings `__v` version. This is a small-project throughput tradeoff: event writes in one wedding serialize.
- The editor uses local React state and React Hook Form/Zod. The existing session provider preserves mounted Events children on recoverable connection errors, blocks edits/saves and exposes Retry inside the modal. Confirmed logout/ineligibility still removes protected content. The dialog portal must enforce that blocked state itself because it sits outside the provider's inert wrapper. No browser-persistent form storage, Redux, query library or new dependency is introduced.
- A version conflict preserves the entered draft and offers an explicit Load latest action, explaining that this discards the local edits. Closing a dirty editor requires a visible discard decision; pending saves cannot be dismissed. Keyboard focus is contained and restored to the opening control.

## Review follow-up — creation completion and dismissal

Owner-approved on 24 October 2026:

- Successful creation closes the drawer only after a successful server response, including confirmation of an unchanged retry. A visible schedule notice names the saved ceremony, retains non-blocking overlap warnings and offers View created event. The UI loads its chronological page, focuses/highlights the saved card and scrolls it into view. Editing an existing event still returns to its saved details; failure keeps the draft and retry key and focuses the error message.
- POST creation and unchanged creation replay return a one-based `schedulePosition`, computed in the same transaction with the list's non-deleted `startAt, _id` order. The web derives the 20-item page from that position. Replay recomputes the position from the current saved event. This is a snapshot hint: concurrent insertions/edits can subsequently shift pages. The success notice and View created event action remain available if a list request fails or a concurrent change moves the card off that page.
- Consume the Dashboard `create=1` shortcut with the supported native history replacement after mounting. Remove only that parameter, preserving other query values and the fragment, without navigating or resetting the in-memory form. Refresh after completion or cancellation must not reopen creation.
- Dirty-close confirmation lives in the fixed footer, with focus on Keep editing and draft retention on cancellation. Saving/loading clears the decision; every discard/dismissal path checks the synchronous request lock, with disabled controls during pending work. While deciding whether to discard, the form and ordinary Save/Close controls are disabled. This prevents the stale Discard action from dismissing an in-flight write and losing its retry key.

## Remaining Events increments

Search/status/date filters; ceremony micro-activities and their timing warnings; soft deletion/restore with retained related data; Google Places search/autofill with manual fallback. Keep their Stitch-shaped controls disabled and visibly Coming soon. Task-dependent counts, linked-task actions, venue-readiness cards and unselected export functionality must not imply live records. Dashboard aggregation and full Recovery UI remain later scheduled work. Do not mark all Events or V1 complete after this increment.

## Verification

Native validation/HTTP/client checks and a disposable Atlas suite cover interval/venue rules, tenant/role boundaries, atomic history, duplicate retries, expired receipts, stale/concurrent edits and rollback. Browser and production/startup evidence, actual results and skipped checks belong in `docs/PROJECT_STATUS.md`.
