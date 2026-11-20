# ADR-032: Task recurrence and protected future edits

Date: 26 October 2026

Status: Owner approved the end-boundary, edit-scope and monthly-date decisions and authorized Tasks Step 4. Implementation verification and pending acceptance are recorded in PROJECT_STATUS.md.

Step 5 follow-up: [ADR-033](ADR-033-task-removal-and-restoration.md) implements recoverable deletion and records the approved Admin/original-Family-creator restore policy. Earlier lifecycle-deferred descriptions below document their original increment.

## Scope and approved decisions

Extend Tasks Steps 1–3 with optional Daily/Weekly/Monthly repeats, interval, start/end dates, optional IST due time, separate dated tasks, a working Has Recurrence filter and “This task only” / “Future repeats” editing. Follow the corrected refined Stitch Tasks recurrence section, using the existing drawer, palette and controls. Ordinary single tasks remain valid. No new dependency, credential or hosting change is required.

The owner explicitly approved:

- Default the end to the wedding date, while permitting an explicitly chosen later end with a visible non-blocking warning. For an already-past wedding, require an explicit end. The saved end is a snapshot, not a live dependency on later wedding-date edits.
- Future edits preserve completed and individually edited copies. One-copy edits never change the pattern or other copies.
- Keep the original monthly anchor: 31 January → 28/29 February → 31 March, rather than skipping February or drifting permanently to the 28th.

Stopping future generation keeps already created tasks. Removing tasks and recovery remain their later increment; Family deletion is approved but restoration policy is still pending. Full dashboard/ceremony task integrations, notifications and calendar integrations are not delivered here.

## Data and generation

Express owns validation, authorization, dates, generation and persistence. A TaskSeries stores the wedding, frequency, interval (integer 1–365), India-local start/end, optional HH:mm time, template title/notes/priority/assignees/ceremony, active flag, generation cursor, current editor and optimistic version. Each generated Task has RECURRENCE source, seriesId, occurrenceDate, occurrenceEdited and recurrenceExcluded. User-supplied source/series identities remain rejected.

Dates are real calendar dates in years 1000–9999. Daily/weekly arithmetic and anchored monthly clamping are bounded. Store each due instant in UTC; omitted time means 23:59:59.999 India time and dueDateOnly=true. New copies start TODO and complete separately. A completed manual task must first be reopened and saved before conversion. Converting an eligible manual task retains its ID/history as the first copy; subsequent dates get separate IDs.

For a new pattern, a past start is an anchor: begin today or at the next scheduled date, with no initial backfill of earlier dates. Reject a pattern without any upcoming occurrence. Create a bounded 90-day window from that first scheduled date, including a first copy even for sparse intervals. A saved cursor supports catch-up of scheduled dates after a later server outage. Limit each generation transaction to 100 dates.

The existing persistent Express process extends due patterns after startup and every 15 minutes, selecting at most five series per pass toward today + 89 days. It serializes in-process passes; existing wedding/account/member locks, MongoDB transactions and a unique (seriesId, occurrenceDate) index also protect concurrent processes. The uniqueness constraint includes retired and deleted copies: retries never regenerate a user-removed task. GET requests never generate tasks. Background cursor changes do not increment the editable series version.

Generation validates that the latest pattern editor remains an active, verified Admin/Family Member, all selected assignees remain eligible and the selected ceremony remains available. A missing dependency pauses extension with generic generationIssue/retryAt metadata and a 15-minute retry. Eligible healthy/untried patterns (null retryAt) precede retries; eligible retries are ordered by their oldest retryAt before cursor/ID. Advancing retryAt rotates blocked patterns instead of letting unchanged early cursors monopolize each five-pattern pass. Recheck cooldown eligibility inside the transaction as well as in the candidate query. Do not silently drop assignees/ceremonies or write raw driver errors. An eligible editor can repair/save the template and become its current editor. Stopping remains possible with unavailable dependencies. Existing tasks stay readable with the usual unavailable-reference handling.

This scheduler is implemented for the existing long-running local Express application. Deployment is still deferred: a reliable production scheduler/lifecycle must be checked with the eventual approved hosting arrangement. Do not infer Amplify compatibility, swap providers or claim a deployed durable job service.

## Editing, history and retries

Current verified active Admin and Family Members may create patterns, customize one copy, change future repeats, stop or resume generation. Viewers only read, even when assigned. Assignment does not grant write permission. Preserve tenant isolation, current account/member/wedding validation and both workspace guards.

An ordinary task edit marks a generated copy occurrenceEdited=true, including completion/reopening. The pattern editor is a separate explicit scope. Its boundary is the later of today's India date and the selected copy's original occurrence date. Reconcile only copies at/after that boundary whose deadlines have not passed, preserving past, completed and individually edited tasks. Untouched matching copies adopt the template/time but retain status. Untouched dates no longer matching the pattern leave normal lists via recurrenceExcluded=true; retain their rows and history. If a later pattern matches a retired untouched date, it may reactivate the same ID only while its saved old deadline has not passed. Apply that old-deadline check inside generation/reactivation too, before applying the new template or due time; neither a future edit nor worker catch-up may rewrite an expired retired copy. This is recurrence reconciliation, not ordinary task deletion/recovery. Deleted copies never reactivate through generation. Stop skips reconciliation and keeps every existing copy.

Use GET/PATCH /weddings/:weddingId/tasks/:taskId/series for current definitions and future edits. Retired originating copies may still identify their pattern for retry/recovery; ordinary task reads/edits and lists exclude retired copies. PATCH requires CSRF/trusted origin, strict validated body, UUID Idempotency-Key and series If-Match. Receipts are user/wedding scoped, hashed and valid for 24 hours. Exact retries acknowledge current state, never reapply older settings. Changed-key bodies and stale versions conflict. Tasks, series, audit records and receipts commit atomically; generation also records each created task. Keep explicit series create/update/stop and task rescheduling history.

The web uses api-client only, React Hook Form/local state and existing session Context. It previews upcoming dates without becoming authoritative. The Repeat task checkbox, frequency/interval/start/end controls and notices follow Stitch. Saved details/table show rhythm, stopped/attention/customized states. Has Recurrence filters both active and stopped series copies. Due This Week stays Coming soon until its week definition is selected. One-copy → future-scope switching confirms unsaved changes. The owner-approved 27 October popup follow-up in ADR-029 also applies to future-repeat dirty-close confirmation, with Keep editing/Escape retaining the in-memory draft. Save locks block close/discard, temporary connection failures retain drafts/retry keys, and conflicts require an explicit Load latest pattern action.

## Verification and later work

Native tests cover schema/serialization, India deadlines, monthly anchoring/leap years, sparse/bounded generation and filters/routes. Disposable Atlas tests cover actual separate records, unique dates, current roles/tenants/dependencies, retries/conflicts, concurrent edits, protected histories, retirement/reactivation, stop/resume, audit rollback and cursor extension/permission pause, fairness with more blocked patterns than the batch size, and unchanged expired retired copies after future edits/worker catch-up. Browser checks exercise creation, one-copy/future editing, stopped patterns, outage retry, Viewer/Family access and phone layouts. Actual results and limitations belong in PROJECT_STATUS.md; independent review stays batched. No commit, push or deployment is authorized by this increment.
