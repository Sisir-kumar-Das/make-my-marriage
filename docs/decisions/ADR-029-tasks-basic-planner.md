# ADR-029: Tasks Step 1 — basic wedding planner

Date: 25 October 2026

Status: Owner authorized Step 1 implementation; delivered scope and actual checks belong in PROJECT_STATUS.md.

Step 2 follow-up: [ADR-030](ADR-030-task-assignment-and-my-tasks.md) now extends this initial scope with multiple assignees/My Tasks. The unassigned-only descriptions below document the first increment.

Step 4 follow-up: [ADR-032](ADR-032-task-recurrence.md) now implements recurrence and its filter/editing/generation rules; earlier recurrence Coming soon statements below describe their original increment.

Step 5 follow-up: [ADR-033](ADR-033-task-removal-and-restoration.md) implements recoverable deletion and records the approved Admin/original-Family-creator restore policy. Earlier lifecycle-deferred descriptions below document their original increment.

## Scope and owner decisions

Implement the refined Stitch Tasks table and right drawer with genuine list/create/details/edit, title, optional notes, three statuses (TODO/IN_PROGRESS/COMPLETED), four priorities (LOW/MEDIUM/HIGH/URGENT), optional India-local due date/time and optional active ceremony link. Unassigned/wedding-wide tasks are valid. Keep assignments/My Tasks, filters, recurrence, delete/restore and checklist generation visibly Coming soon. Basic stable pagination is included to avoid an unbounded list; real task-page counts may be shown, while full dashboard aggregation remains later. No fake rows, progress or counts.

The owner explicitly approved past-due entry with a warning and requested a stronger visual warning on 25 October. It remains non-blocking: incomplete tasks are overdue after their actual deadline; completed tasks are not overdue. After-wedding deadlines warn but save. On 26 October the owner approved hiding past-due guidance for Completed and presenting its after-wedding deadline as neutral information (“No action is needed”); reopening restores the ordinary incomplete-task warnings. This is guidance only and changes no stored deadline/completion rules. A date without a time means 23:59:59.999 Asia/Kolkata, not midnight. Add a small `dueDateOnly` boolean alongside UTC `dueAt` so reopening preserves the user's date-only choice; reject contradictory date-only payloads rather than lose precision. Clearing the date requires clearing any entered time. Optional deadlines can be null. Completed timestamps/actor are set on completion, retained on completed-task edits and cleared on reopening. No task future-completion ban is introduced.

The owner confirmed Family Members may delete tasks, unlike whole events (ADR-027). Deletion is still deferred to the planned lifecycle increment; restoration policy remains pending and no task lifecycle endpoint is implemented here. This records the choice without enabling it early. The baseline PRD's reject/warn choice for past dates is resolved to warn/allow; original baseline files are preserved.

## Integrity and API

- All task data access/rules stay in Express. Current verified active account, active wedding membership and active wedding are rechecked on reads and writes; only Admin/Family Member may create/edit. Viewers read. Preserve both workspace SSR/RSC guards.
- GET/POST `/api/v1/weddings/:weddingId/tasks`, GET/PATCH `/:taskId` support bounded page/limit, strict fields, safe envelopes, ETags/If-Match and CSRF/trusted-origin checks on writes. Assignee/source/recurrence/deletion/actor fields cannot be injected. New tasks have source MANUAL and no assignees.
- Writes use 24-hour account/wedding-scoped hashed idempotency receipts. Match request target, normalized fields and version; replay returns the current authorized record without repeating an earlier state change. Stale versions and conflicting retry payloads require explicit recovery. Expired receipts may be replaced before TTL cleanup. Task/history/receipt writes commit atomically.
- Lock the current user/member and wedding in mutation transactions, including a separate wedding `taskRevision` counter that does not change the settings/cover version. Writing the same wedding document serializes task ceremony-link validation with existing event edits/deletion. Reads/counts use a coherent transaction snapshot and fixed current instant.
- New/changed event references must be active and belong to the same wedding. Event removal retains existing task references as unavailable historical associations, allowed by the approved lifecycle alternatives. No deleted event details are disclosed. Editing another task field may retain that exact unavailable association, or explicitly clear/change it; new attachment to a deleted/foreign event is rejected. Restoring the ceremony makes its retained association available again. Task records are not cascaded away.
- Reuse the existing immutable activity collection for TASK_CREATED/TASK_UPDATED labels. A task's basic source/assignee fields are stored for compatibility, not evidence that assignment/recurrence/checklists work. Do not add empty module trees or dependencies.

## UX and remaining increments

Reuse Stitch's typography, plum/light surfaces, table columns, status/priority controls, task drawer, disabled assignee/recurrence/delete areas and honest empty/loading/error states. Use a prominent amber warning with icon, heading and explicit overdue consequence beside past due fields; the exact past-entry message is an owner-approved addition because no dedicated Stitch past-entry warning exists. Do not make a recoverable past date look like a rejected save.

Create success closes the drawer and offers View created task; edit success returns to saved details. Keep input and retry identity on failures; disable controls/close/discard during saves. Owner-approved follow-up, 27 October 2026: dirty close/cancel and scope-switch confirmation now uses a centered modal popup above the task drawer, superseding the fixed-footer prompt. Match the current Stitch plum/Inter tokens; focus Keep editing first, trap focus in the popup, treat Escape as Keep editing and require explicit Discard changes. Preserve the draft and return focus on cancel. The same popup is reused for future-repeat edits; existing pending-save locks and discard destinations remain unchanged. Task deletion retains its separate fixed-footer confirmation. Explicit conflict reload must not silently overwrite a draft. Ceremony options load in bounded pages with a visible Load more action, retry and an unavailable retained-link explanation. Preserve mounted task drafts during transient session errors, extending the existing Events mechanism only to `/tasks`; this is separate from the owner-deferred homepage session-entry stall, which remains untouched.

Verify strict contracts, dates/status/completion/overdue behavior, current roles/tenant boundaries, atomic history/receipts, retries/concurrency, unavailable ceremonies, browser save/reopen/reload/conflicts, warning visibility and desktop/phone navigation. Record actual tests and limitations; independent reviews remain batched. No credentials, notification/calendar integration, commit, push or deployment is authorized by Step 1.
