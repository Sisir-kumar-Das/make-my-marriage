# ADR-031: Tasks search, filters and URL pagination

Date: 26 October 2026

Status: Owner authorized Tasks Step 3, including compact From/To fields in the existing Stitch toolbar.

Step 4 follow-up: [ADR-032](ADR-032-task-recurrence.md) now implements recurrence and its filter/editing/generation rules; earlier recurrence Coming soon statements below describe their original increment.

## Scope

Extend ADR-029–030 with literal task-title/notes search, status, priority, one assignee or Unassigned, one ceremony or Wedding-wide, optional inclusive India due dates and an Overdue quick filter. Support these in both All Tasks and My Tasks. Preserve original approved baselines and current create/edit/assignment/security behavior. Invitations, recurrence, lifecycle/recovery and dashboard/ceremony task integrations keep their later sequence. Has Recurrence and Due This Week shortcuts remain disabled reference previews; the delivered date-range fields provide due-date filtering without introducing an unapproved week definition.

## Express query contract

- GET `tasks` and `tasks/my` accept strict `q`, `status`, `priority`, `assigneeId`, `eventId`, `from`, `to`, `overdue`, `page`, `limit`. Reject unknown keys/operators, arrays/objects, invalid IDs/enums/dates, reversed dates and out-of-bound pagination. Search trims to at most 160 characters and rejects internal control characters. Escape regex metacharacters and use case-insensitive literal matching over title/description only; never search provider content, other weddings or member profiles.
- Empty optional filters are omitted. `assigneeId=unassigned` means an empty assignment array; another value is a user ID. `eventId=none` means no ceremony. Retained unavailable ceremony/member references can be filtered by ID within the authorized wedding, without exposing their profile/name. Foreign/nonexistent IDs return an empty matching slice, never foreign details.
- Dates are real years 1000–9999. Interpret `[from 00:00 IST, day after to 00:00 IST)`, independently optional, against the UTC due instant. Date-only tasks retain their saved India end-of-day deadline. No-deadline tasks do not match a selected date bound. This is deadline inclusion, not Events interval-overlap logic.
- `overdue=true` requires incomplete status and a non-null deadline strictly before the read snapshot instant. `overdue=false` (accepted in links/API) includes completed, undated and not-yet-due tasks. A completed/status filter combined with Overdue correctly has no matches; no status is silently changed.
- AND every filter with current wedding/deleted scope. My Tasks also ANDs the authenticated user's ID; another assignee filter checks co-assignment and never replaces the current-user condition. No userId query override is allowed. Keep current verified account/member/wedding authorization on every read.
- Apply all predicates before counts and bounded pagination. Return genuine summary counts for the selected view, plus All/My totals under the same filters and transaction snapshot. Keep deterministic newest-first createdAt/ID sorting, clamp pages after concurrent changes and return empty collections with 200. The existing minimal member-picker endpoint continues to accept pagination only; it is not a task-search endpoint.
- Add the approved priority query index; retain tenant/status/deadline/assignee/event indexes. No Atlas Search, dependency, new credentials or write-time storage change is required.

## Frontend

Keep Stitch's toolbar, dropdowns and quick-filter styling, adding the owner-approved compact From/To controls with IST guidance and Apply/Reset. Selection options use authorized bounded member/ceremony reads, with refresh/retry/Load more and a neutral selected-ID fallback when its label is unavailable. General filters apply explicitly rather than request on every keystroke. The Overdue quick filter applies the current form choices with its toggle.

Use controlled draft fields keyed to the current URL, without unmounting focused controls. All recognized filters, view and page are encoded in `/tasks`; applying a filter or changing All/My resets page 1, while pagination retains filters. Refresh and Back/Forward restore applied choices. Unapplied draft edits are temporary. Reset preserves the current All/My view. Invalid links show a repair action instead of silently dropping bad filters; invalid draft input keeps the last applied results and shows its validation error. Stale or unavailable list requests hide previous rows/counts, preserve the URL and provide Retry. Request cancellation plus current URL identity prevents stale responses replacing newer filters. Canonicalize a server-clamped page with replaceState without a new Back entry.

Create success keeps the active filters, resets page 1 and offers View created task even if the new task is outside them. The notice explains that filters remain applied. As in Step 2, creating from My Tasks without assigning oneself opens All Tasks, retaining applied filters. Edits may remove a task from the matching slice while saved details remain readable. This avoids silently discarding the user's search or misrepresenting a successful save as failure. Full dashboard shortcuts are still deferred.

Verify query/URL validation, literal matching, India midnight edges, no-deadline/overdue/completed cases, combined My scope, tenant/deletion denial, counts/pagination and frontend field/URL consistency. Actual evidence belongs in PROJECT_STATUS.md. Independent review remains batched; no commit/push/deployment is authorized.
