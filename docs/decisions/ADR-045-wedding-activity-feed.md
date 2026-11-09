# ADR-045 — Wedding Activity and Recent Activity

Status: Implemented and checked locally

Date: 7 November 2026 (Asia/Kolkata)

## Decision

- Replace the Dashboard placeholder with the three newest visible updates. View All opens the protected `/activity` route inside the existing workspace shell. Retain the Dashboard overview, countdown, read-only Viewer note and role-specific shortcuts.
- Use the approved refined Stitch export. The full page groups records by India calendar date, shows actual counts and has Previous/Next controls with 20 entries per page. Keep the agreed mobile adjustments and omit the mockup's decorative live-stream indicator.
- Express authorizes the read against the verified active account, active wedding membership and available wedding. The Dashboard and timeline use the same read endpoint, `GET /api/v1/weddings/:weddingId/activity`. Its bounded page and limit parameters support the three-entry preview and 20-entry page. The preview requests the newest three entries without counting. The full page counts known rows directly and checks legacy task origins only where needed. Stable newest-first ordering breaks timestamp ties with the activity ID. A snapshot read keeps each page's authorization, results and counts consistent.
- Allowlist readable actions. Share planning updates, accepted invitations and membership changes with current wedding members. Show invitation creation to Admins only, using a generic summary without the recipient's address or token. Keep raw metadata, relationship and reassignment details, and other private audit data outside the response.
- Read the append-only Activity collection and existing saved display labels. Link only to currently available task and ceremony records in the same wedding. A deletion entry stays plain text even after restoration. Keep old generic updates generic. New task completion transitions and accepted invitations record the status or role explicitly within their existing transactions. Creating a task with Completed already selected is a creation.
- A checklist generation and a recurring series setup each appear as one entry. New automatic task creation records and the accompanying edit when converting a task to recurrence are retained in the underlying audit history with a feed visibility marker. Subsequent individual completions remain visible. Historical checklist rows use the generation's durable task IDs. Historical recurrence rows are classified using the retained task source and series timestamps, keeping a manually created task's earlier entry when it was converted later. Historical rows whose origin can no longer be determined remain readable.
- On mobile, the compact pager keeps the count and Prev/Next on one row, with 44 px controls. The single task or ceremony title link gains a full-row tap area without adding a second keyboard stop.
- Scope browser requests and loaded data to the current account, wedding, role and page. Show the reference's loading, empty and Retry states. Recoverable failures have an explicit retry and authorization failures clear the feed.

## Verification boundary

See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for verification and remaining checks. Atlas access, owner acceptance, deployment and independent review are tracked separately.
