# ADR-020: Private wedding cover uploads

Date: 23 October 2026

Status: Accepted for implementation; verification results belong in PROJECT_STATUS.md

## Scope and owner decisions

Complete the optional cover portion of wedding setup and add a small Admin-only Change cover control to the existing dashboard. Follow the corrected Stitch Cover & Review HTML. The owner selected JPG/PNG up to **15 MB (15,000,000 bytes)** and approved preview, drag positioning and zoom now. The preview and dashboard use the same 2:1 frame. Retain the original file; framing changes presentation rather than destructively cropping it. The signature artwork remains the fallback. The minimalist option, avatar/gallery uploads, full wedding settings and public wedding sites remain deferred.

Use the **same Cloudflare account and private R2 bucket for development and production**, as explicitly requested. The API chooses `dev/` or `prod/` from its NODE_ENV and generates opaque object keys. Secret credentials remain in each API environment, never in web variables, responses or logs. Presigned URLs necessarily include a non-secret access-key identifier and a short-lived signature; treat the URL itself as a temporary capability and never log it. This qualifies the baseline recommendation for separate buckets; environment prefixes still separate objects. Deployment remains deferred.

## Storage and authorization

Owner-approved loading refinement, 24 October 2026: the signature image is displayed only when no custom cover is saved. A saved custom cover uses a neutral, fixed-size placeholder and loading indicator while its private link and image bytes load. Metadata/image failures show a retry action without substituting another couple's image. Dashboard and Settings share this behavior. The selected upload filename is shown from the in-memory selection, including after Back/Next and same-file reselection.

Express owns validation, current account/membership checks, metadata and attachment. Browser JSON calls use the existing API client/relay, including CSRF and refresh recovery. File bytes use a short-lived signed R2 PUT directly, without proxying through Next.js/Express. R2 CORS permits only configured local frontend origins during development; the bucket remains private.

The baseline only names wedding-scoped media endpoints, while setup must not create a wedding before final confirmation. Add explicit `/media/wedding-cover/upload-url` and `/media/wedding-cover/:mediaId/complete` routes for verified users without an active wedding. These create account-owned temporary media, never a wedding/draft/membership. Existing-wedding routes require active Admin membership. Wedding members may obtain short-lived signed reads for the current cover only. No arbitrary R2 key or permanent public URL is accepted from the browser.

Validate size/MIME before issuing a URL, sign expected type/length, then verify actual object metadata, signature and decoded JPEG/PNG content before READY. Sharp is an explicit API dependency for bounded decoding (40 megapixels maximum), EXIF orientation and a high-quality, metadata-stripped display copy. Keep the original private. Browser PUTs can only write a staging key; completion writes immutable original/display keys with conditional writes. Reusing a still-live upload URL cannot replace a published cover. Completion leases prevent overlapping processing; errors remain safe and retryable. Never log storage responses, credentials or signed URLs.

## Save, retry and cleanup

Selection and framing stay in React memory across Back/Next and recoverable session failures. Only final Create uploads/confirms the photo, then submits its READY media ID and framing with wedding details. Wedding, Admin, media attachment and creation-request record commit atomically. Preserve ADR-017's original-key/same-body recovery, including after India midnight and a lost response; completed upload retries reuse their asset. Changing the selected file or framing creates a different normalized request. No browser storage/draft persistence is added.

Existing-wedding cover saves/removals require the current version. An identical retry returns the already-saved result; a stale differing edit returns a conflict. Keep the previous cover until replacement attachment commits. Detach and mark replaced/removed assets DELETE_PENDING in that transaction; removal restores the default. READY assets cannot be attached to another owner/wedding or reused after deletion is scheduled.

Pending/unused assets expire after 24 hours. Cleanup first claims expired metadata atomically, checks active references, and deletes only generated keys under the current configured environment/bucket. Signed reads expire after five minutes; replacement deletion waits at least ten minutes. Staging objects are removed after the upload URL has expired, including attached uploads. The local long-lived API runs bounded cleanup periodically; a native command provides an explicit sweep. A durable scheduled cleanup/processing strategy remains a prerequisite for serverless deployment, alongside ADR-015's dispatch prerequisite.

## Verification

Protect real behavior with native validation/storage/router/framing tests and isolated Atlas tests for atomic attachment, ownership/roles, completion/retry races, optimistic conflicts and cleanup. Use fake storage for deterministic failures and actual R2 only with generated disposable test images/keys. Never change the owner's existing wedding or upload personal photos for testing. Verify browser progress/preview/positioning, setup retention/retry, Admin replacement/removal, private access and desktop/mobile layouts. Record exact live checks, cleanup and skipped checks in project status. No commit, push or deployment is authorized by this implementation request.
