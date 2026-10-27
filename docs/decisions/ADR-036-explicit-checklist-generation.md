# ADR-036: Explicit checklist generation and safe regeneration

Date: 27 October 2026

Status: Owner approved implementation after accepting the catalog. The owner explicitly chose Admin/Family generation and keeping deleted template items deleted. Independent review/manual testing is batched until the whole Checklist feature is complete; implementation verification remains required.

Follow-up: [ADR-037](ADR-037-checklist-generation-history.md) delivers the history read API and UI. The remaining-history statements below record the original Step 2 handoff. Whole-Checklist independent review/manual acceptance remains pending.

## Behavior and owner decisions

Generate one complete available generic pack at a time, only after a real wedding-scoped preview and explicit confirmation. Admins and Family Members may prepare/generate; Viewers keep the generic catalog/preview and cannot access generation controls or wedding generation previews. This resolves the older system design's Admin wording in favor of the approved API Admin/Family policy. Keep Odia Rituals Coming soon. No user-created pack editor or automatic wedding-setup generation.

The confirmation shows actual items to add, existing items to keep, and previously deleted items to skip, with exact date-only deadlines and a non-blocking past-due warning. New tasks start TODO, unassigned and wedding-wide, with catalog titles/notes/priorities. Calculate deadlines from the saved main wedding date and backend daysBeforeWedding, at 23:59:59.999 Asia/Kolkata. Past dates are allowed under the existing Tasks decision. Kept tasks retain their current title, notes, priority, deadline, assignees, ceremony, completion, creator and version; manual same-title tasks remain independent.

Deleted template tasks are never re-added by generation. Restore them only through existing Recovery permissions: Admin-any, Family-original-creator. Generation does not transfer task ownership or broaden deleted-task read access. The preview exposes only generic catalog wording for skipped deleted items, with no saved deleted title/notes/IDs. Kept recurrence-retired copies retain their pattern-controlled state and are not reactivated.

## Identity and transactional storage

Add CHECKLIST source with required templateId/templateVersion/itemKey. Keep template/item keys stable; templateVersion records the content that originally created that task. A permanent unique task index over weddingId + templateId + itemKey, limited to CHECKLIST sources but including deleted records and every version, supersedes the baseline's active/version-scoped guard. This implements the owner's keep-deleted/preserve-edits decision across future content revisions: new item keys can add new tasks; unchanged keys never replace old tasks merely because a pack version changed. Do not alter original baseline files. Existing sources had no CHECKLIST records under the previous schema.

Normal task edits cannot inject/change source metadata. If a checklist task is explicitly made recurring, its original record keeps its checklist identity through conversion, future edits and retired-copy reactivation; additional dated copies use RECURRENCE. Generation therefore cannot lose that original item identity or recreate it. Preserve all existing recurrence/deletion/past-copy rules.

Reuse the existing Tasks current-user/member/wedding authorization and mutation locks, including wedding taskRevision. Create every new task, TASK_CREATED activity, immutable ChecklistGeneration summary, CHECKLIST_GENERATED activity and 24-hour hashed ChecklistWriteRequest receipt in one MongoDB transaction with snapshot/majority guarantees. Keep writes ordered inside the transaction. Task deletion/restoration and all other task mutations serialize through the same wedding lock. Store history now so writes are traceable; its browsing screen remains the next increment.

## API and concurrency

- GET `/api/v1/weddings/:weddingId/checklists/preview?templateId=...&templateVersion=...`: current Admin/Family, strict fields, transactional snapshot. Return actual counts/items and a previewHash over current pack content, wedding date/taskRevision, India day and planned result. This is a concurrency fingerprint, not an authorization credential.
- POST `.../checklists/generate`: strict templateId/templateVersion/previewHash body plus UUID Idempotency-Key, trusted Origin/JSON/CSRF, verified session, current role/tenant checks and bounded mutation rate limit. Client cannot inject dates, tasks, assignments, source, actor or tenant fields.
- First attempts recompute the preview inside the locked write transaction. A changed plan/day/date/version returns a visible conflict requiring a fresh explicit preview; no tasks are partially added.
- Exact unexpired receipts are checked before preview/version revalidation, but after current authorization. Lost-response retries, including after midnight, return the original immutable generation summary without applying writes again or undoing subsequent edits/deletion/restoration. Changed payloads with the same live key conflict. Expired receipts may be replaced after a fresh preview, while history remains permanent. The unique source identity remains a backstop beyond receipt expiry.

## Frontend and design

Use the existing catalog and corrected Stitch detail-inspection/Safe Sync Confirmation styling. Generate Tasks opens an accessible centered Radix confirmation with real add/keep/deleted counts, task/date review, warning, Cancel and explicit Confirm generation. All pending save dismissal paths are locked. Success reports actual added/kept/skipped counts and links to the existing Tasks page; recovered responses clearly identify the original recorded outcome. Checklist tasks have an honest origin label in Tasks/details.

Retain the same key/body after an uncertain POST failure, with Retry generation; never silently fetch a new preview and replace an uncertain attempt. Definite preview/version conflicts offer explicit re-review/catalog reload. Canceling a preview performs no mutation. Local state/request cancellation rejects stale preview results. Extend the existing checklist session-preservation boundary so background outages cannot unmount an open generation attempt; show/focus Retry inside the modal, disable mutations until session recovery, and keep confirmed session loss protected. No local-storage copy, new state library, credentials or dependency.

## Verification and remaining work

Native tests protect strict contracts, date-only/leap-day planning, deleted-detail non-disclosure, fingerprints and HTTP session/origin/JSON/CSRF boundaries. Disposable Atlas tests cover current permissions/tenants, source identity across versions/deletion, edits/completion/assignment preservation, concurrent keys and identical retries, history/audit rollback, stale dates/plans, midnight/expired receipts, creator-scoped recovery and recurrence-origin preservation. Run existing recurrence regression because its source-preservation paths changed. Browser-check confirmation/cancel, warnings/counts, pending locks, lost-response Retry, background session recovery, normal generated-task editing, stale-preview re-review, roles and desktop/mobile layouts. Record actual checks and cleanup separately from independent reviews in PROJECT_STATUS.md.

Next: generation history browsing and the remaining whole-Checklist checkpoint, then independent code review/manual testing and owner acceptance. Do not mark those completed early. Production scheduling, unrelated providers, commit/push and deployment remain outside this authorization.
