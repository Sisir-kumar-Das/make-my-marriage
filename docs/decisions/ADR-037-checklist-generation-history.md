# ADR-037: Read-only checklist generation history

Date: 27 October 2026

Status: Owner approved the history increment after Checklist Steps 1–2. They explicitly approved the label “Results at the time of generation” and read-only history. Independent code review/manual testing follows the whole Checklist feature; this increment does not authorize agent contact, commit/push or deployment.

## Product behavior and design

Replace the Coming soon history section inside `/checklist` with real wedding-scoped records, newest first. Follow the corrected `make_my_marriage_checklist_templates_generation_history/code.html` history table, typography, plum palette, badges and Details action inside the existing shared shell. Use the reference's horizontal table scrolling on narrow screens, keeping page controls and the accessible Details dialog usable on phones. Use factual Read-only history copy instead of unsupported security guarantees or demo audit rows.

Each row shows the saved template name/version, timestamp in Asia/Kolkata, current eligible initiator name, added/kept/deleted-skipped counts and Applied status. A successful no-op confirmation is also an applied generation with zero additions. Canceled previews and failed transactions create no record; exact receipt retries return the original record. Refresh after confirmed generation/replay and provide explicit Refresh history. Page size defaults to 20, with Previous/Next and real totals. Loading, empty and failure/Retry states are distinct from saved history.

Details opens a read-only summary: saved template/version, generated timestamp, initiator, wedding date used and the original counts, with Close and View Tasks. Label outcomes “Results at the time of generation.” Later task changes, completion, deletion, restoration and wedding-date/content changes never recalculate old counts. View Tasks opens the normal current Tasks page; no historical task titles, deleted records or private receipt fields are exposed. No history edit/delete, revert-generation or generated-task snapshot browser is added.

## Authorization, privacy and storage

The approved API baseline permits Member access: current Admin, Family Member and Viewer can read only their own active wedding's history. Reuse Express Tasks read authorization inside a snapshot transaction, checking current verified active user, active membership and non-deleted wedding on every list/detail read. Keep layout and page-level workspace guards. Generation remains Admin/Family-only under ADR-036.

Read existing immutable ChecklistGeneration summaries; add no schema/index or data migration. Do not depend on a pack still being in the current catalog or on the 24-hour write receipt. Project out addedTaskIds and return an explicit allow-list DTO: generation id, template id/version/name, wedding date used, added/kept/deleted counts, createdAt and initiator name. Never return raw actor ids, email addresses, request/key hashes, session/token data or saved task details. Resolve names only for current active, verified accounts with active membership in this wedding; otherwise show Unavailable member. Counts and pack/date metadata are historical; eligible display names are current, consistent with existing member-name handling.

## API and frontend

- GET `/api/v1/weddings/:weddingId/checklists/generations?page=1&limit=20`: strict positive integer pagination, maximum 100 per page and 100000 pages; reject unknown fields, arrays/objects, decimals and unsafe inputs. Order by createdAt descending, then id descending; count/page reads share a snapshot. Clamp a missing page to the last real page (empty history is page 1, zero pages/records).
- GET `.../generations/:generationId`: authorize the current wedding and look up both identifiers together; invalid/missing/foreign generation ids cannot expose records. Reject unsupported detail queries. Return a saved summary, not provider/task content. Both reads use no-store and the existing session/trusted-origin boundary. No history mutation route.

Web uses api-client, local React state, AbortController and the existing session Context. Each request is keyed to wedding/page/retry or selected generation, rejecting canceled/stale completions. New generation refreshes the first history page; detail selections have their own fresh read and accessible loading/error handling. Background session errors preserve the existing generation attempt and expose local Retry inside an open history dialog. The Details dialog traps focus, closes with Escape/Close and returns focus to its initiating row (or history heading after refresh). No new dependency, credential or browser persistence.

## Verification and checkpoint

Protect strict pagination and read-only HTTP/session/origin behavior with native tests. Extend the disposable Checklist Atlas suite for all current roles, tenant/detail isolation, immutable saved outcomes after task changes, exact pagination/tie ordering, missing-page clamping, eligible/current/unavailable initiators and disabled/removed/deleted-wedding denial. Verify reads do not change tasks, revisions, receipts or activity. Browser-check real history/detail, generation-triggered refresh, reload, pagination, error/Retry, stale canceled details, keyboard/focus, all roles and desktop/mobile layout. Record actual results and untested cases in PROJECT_STATUS.md.

Next: owner and independent code review/manual testing of the whole Checklist feature, then discuss Members and invitations in the agreed order. Production scheduling and the deferred homepage-entry issue remain at their existing checkpoint.

Visual review follow-up, 27 October 2026: the owner-authorized P3 correction aligns card titles (Inter) and selected preview/history titles (Playfair) with the corrected title-section token: 1.25rem, weight 600, line-height 1.4 and letter-spacing −0.01em. This corrects implementation styling; the product/API decisions above are unchanged. Independent full-feature findings and fresh follow-up verification are recorded in PROJECT_STATUS.md.
