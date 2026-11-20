# ADR-034: Task entry points and ceremony-linked views

Date: 26 October 2026

Status: Owner approved implementation after reporting the independent Tasks corrections passed. Actual verification and acceptance belong in PROJECT_STATUS.md.

## Scope and owner-approved UX

Connect the delivered Tasks planner to Dashboard and Events before Checklist templates, following the existing increment plan. Enable Dashboard Add Task. Inside a saved ceremony, connect Stitch's Linked Tasks pill strip and Manage Tasks, with the owner-approved small matching Add Task button alongside it. Reuse the existing Tasks page and drawer; do not stack task drawers over the ceremony drawer. Supply Back to ceremony navigation and refresh genuine linked tasks/counts on return.

A new ceremony must be saved before adding linked tasks. When ceremony or activity fields are dirty, Keep editing preserves the draft so it can be saved; Discard changes explicitly abandons it before navigating to Tasks. Pending saves/deletion/discard decisions block those navigation actions. Existing save locks, conflict handling, retry keys, history and session draft retention remain in effect. Background session failure brings the inline connection notice and Retry into view with focus, while preserving ceremony/activity drafts and blocking mutations until authentication is confirmed. Tasks and ceremony activities remain separate concepts.

## Routes and storage

- Dashboard `/tasks?create=1` opens task creation without a ceremony selected.
- Ceremony Add Task uses `/tasks?eventId=<id>&fromEvent=<id>&create=1`; Manage Tasks uses the same ceremony filter/return context without create. A linked task chip adds `task=<taskId>` to open its saved details.
- `create`, `task` and `fromEvent` are strictly validated frontend navigation values, separate from API filters. Reject duplicates, malformed values and conflicting create/detail intents. Return URLs are generated only as `/events?event=<validatedId>`; never accept an arbitrary redirect URL.
- An initial ceremony selection is loaded from the current wedding's existing authorized event read before opening creation. Unknown, removed and foreign ceremonies fail visibly with retry/dismiss controls; they never silently become wedding-wide tasks. Express revalidates the active ceremony on save. The ceremony remains editable in the ordinary task form.
- Consume one-shot create/detail intents once the drawer opens; preserve the ceremony filter and return context through filtering/pagination. Automatic page correction changes only page on the live URL, retaining a still-pending create/detail intent without restoring one that has already been consumed or dismissed. Save/close followed by reload must not open a blank creation form again. Loading/error/retry and stale/aborted request handling belong to the shortcut request, with current URL identity checked before applying a response.
- `/events?event=<id>` opens current saved ceremony details through the existing authorized API. Close consumes this return target; unavailable targets show an error/retry rather than stale details. Returning does not depend on the ceremony being on the currently visible schedule page.
- Tasks remain separate wedding-owned records with the existing optional eventId; no task copies or new storage fields are introduced. Clearing/reassigning a task changes which ceremony shows it. Existing event removal retains unavailable associations without deleting tasks, as ADR-029 specifies.

## Linked reads and permissions

Reuse the bounded Tasks list filtered by eventId for three recent linked-task previews and its genuine total. Display status, compact wrapped titles and a more/manage action for remaining records. Loading, empty and failure/Retry states are explicit. Removed and recurrence-retired records are excluded; completed tasks remain visible. Refresh on opening, focus and the existing minute cadence without requesting provider details.

The Events list adds taskCount from one tenant-scoped aggregate over only the visible event IDs, in the same authorized snapshot transaction as its page. Include active non-retired task records regardless of completion; exclude deleted/retired/foreign rows. Do not use one query per event, an unbounded browser read, or a stored counter that could drift.

Admin and Family Members may create/edit tasks; Viewers see linked tasks and read-only task details. Current account, membership, wedding and task/event ownership are enforced by Express on every read/write. Shortcut parameters confer no permission. Existing task deletion/restoration rules remain unchanged. Assignment and recurrence stay available in the reused form.

## Verification and boundaries

Protect route intent/filter separation, safe return URLs and reload consumption with native tests. Use a disposable Atlas regression for counts/preview agreement, completed inclusion, deletion/retirement/foreign exclusion and unlinking. Browser-check Dashboard/ceremony entry, preselection, save/reload/return, opening/editing a chip, filtered management, dirty ceremony/activity protection, unavailable API/shortcut retry, Viewer/Family access and phone layouts. Record executed checks and limitations in PROJECT_STATUS.md; independent acceptance remains the owner's next checkpoint.

Full dashboard metrics/progress/activity, task-derived readiness, Checklist templates, Members/invitations and deployment retain their later milestones. No credentials, dependencies, environment files, provider calls, scheduler configuration, Git action or deployment are required by this increment. Preserve the approved baseline documents and corrected ignored Stitch exports.
