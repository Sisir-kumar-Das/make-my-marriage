# ADR-025: Ceremony activities — optional end time and derived duration

Date: 24 October 2026

Status: Accepted; implemented locally on 25 October 2026. Independent review remains pending at the batched Events checkpoint.

## Context

The approved PRD lists activity name, start time and optional description. The database design embeds bounded activity subdocuments with an ID, name, startAt and description. The system design requires non-blocking warnings for activities outside their ceremony or overlapping. The corrected Stitch Events drawer supplies activity rows with start time/name and Add/Remove controls, but no end time. Start-only entries cannot establish a complete interval or reliable duration overlap.

The owner approved the recommendation to add an optional end date/time and calculate duration automatically, and requested that this decision be documented before implementation. This decision supplements the original V1 activity fields without editing the approved baseline documents or original Stitch export.

## Decision

- Require an activity name and start date/time; keep description optional. Add optional end date/time, represented as nullable/absent `endAt` alongside `startAt`. An omitted end remains a valid start-only activity; do not invent an end or infer it from the next activity.
- When an end is supplied, it must be a valid instant strictly after the start. Use explicit dates for overnight activities. UI dates/times use Asia/Kolkata, storage uses UTC, consistent with event schedules.
- Calculate duration from the two instants for display. Do not request or independently store an editable duration that can disagree with the end time. With no end, duration is unknown.
- Warn when the known activity timing falls outside the parent ceremony. For activities with both endpoints, compare intervals to warn about overlaps; adjacent endpoints do not overlap. Warnings permit saving. A start-only pair at the same instant can receive a same-start warning, but must not be described as a proven duration overlap. Do not assume missing durations when comparing incomplete intervals.
- Parent schedule edits must re-evaluate timing warnings without silently shifting existing activity times. Preserve the approved lightweight embedded/bounded model, wedding/role authorization, safe writes, version conflicts and append-only change history as activities are implemented. Admin/Family Member can manage activities; Viewer reads.
- Retain the corrected Stitch row layout, typography and colors. Optional end/date controls and derived-duration display are the approved functional addition; discuss any further intentional visual departure before implementation. Activity assignees, independent completion statuses and drag ordering are not selected by this decision.

## Implementation — 25 October 2026

- Each ceremony embeds at most 50 activities, with server-generated IDs, names up to 160 characters and optional notes up to 1,000 characters. Older ceremonies without activities read as empty. Duration is derived in the web UI; no duration field or migration is introduced. The existing request-size limit remains in force.
- The initial delivery used the shared ceremony Save for its activity draft, matching Stitch. The owner found that action unclear and approved individual activity actions on 25 October. This supersedes that initial UI workflow: an existing ceremony has compact saved summaries with Edit/Remove, and a separate single-activity form offers Save Activity and Save & Add Another. Those actions use the approved child endpoints and do not save unrelated ceremony fields. Remove requires an explicit confirmation.
- New ceremonies are created first; opening the created ceremony enables activity management. While editing ceremony fields, save or discard those edits before starting an activity edit. Each successful activity save refreshes the parent version, saved count, warnings and immutable history. Save & Add Another starts a clean draft only after confirmed success, within the cap. Failed/uncertain saves retain the fields and retry key; conflicting changes require explicit Load latest. Saved summaries are labelled Saved; open forms are labelled Unsaved changes. Dates/end/notes stay visible in the single activity editor. This is the owner-approved functional departure from Stitch's single shared footer save.
- POST `/weddings/:weddingId/events/:eventId/activities`, PATCH and DELETE `.../activities/:activityId` also support the approved activity API. They return the current parent event and share its strong If-Match version, 24-hour idempotency receipts and current tenant/role checks. Parent bulk updates reject unknown or duplicate activity IDs. Unchanged retries preserve IDs and do not repeat history.
- Parent and granular activity create/update/remove history commit in the same transaction as the event and receipt. Activity history keeps the parent event ID. Multiple history inserts are ordered as required by Mongoose transactions. List responses expose counts without transferring full activity fields.
- Express supplies authoritative timing warnings; the editor previews the same rules with parity tests. At most four warning summaries include affected IDs/counts: outside ceremony, proven interval overlap, same starts with unknown duration, and a start inside a known interval with full duration overlap unknown. Adjacent intervals do not overlap. Missing ends never acquire an inferred duration.
- The existing dirty-close prompt, pending-save lock, explicit conflict reload, session-error draft retention and retry identity include activity edits. No browser-persistent draft, new dependency, cloud credential or external email is added.

## Follow-up and boundaries

Owner-approved consistency follow-up, 27 October 2026: unsaved activity cancellation and ceremony-close/Tasks-navigation protection now use the same centered discard popup as Tasks (ADR-023 follow-up). Keep editing/Escape retain the in-memory activity; explicit Cancel-discard leaves the ceremony open, while whole-drawer Close and Tasks navigation preserve their respective confirmed targets. Pending writes still block dismissal. Activity removal keeps its separate confirmation.

Activity add/read/edit/remove, chronological display/counts and timing warnings are delivered. Tests cover start-only compatibility, optional-end clearing, invalid/reversed intervals, overnight times, overlapping/adjacent intervals and parent schedule changes, while preserving existing event retries and permissions. Independent review/manual testing follows the owner's batched cadence.

Next is safe event deletion/restore, followed by Google Places before closing Events/V1. Tasks, assignees, activity statuses and drag ordering remain outside this increment. No commit, push or deployment is authorized. The separately approved signed-in homepage entry correction remains recorded in ADR-026.
