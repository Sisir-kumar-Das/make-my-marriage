# ADR-040: Email invitations and explicit wedding acceptance

Date: 28 October 2026

Status: Owner authorized Members Step 2. Supplements the approved PRD collaborator flow, database section 5.6 and API sections 10.3/12.2; Gmail supersedes the baseline Resend choice under ADR-018. On 29 October the owner reported no findings and authorized the accumulated DEV commit/push. Deployment remains deferred.

## Product contract

Only current verified active wedding Admins create/list/share/resend/revoke invitations. Default to Family Member, explain Admin authority, and support Admin/Family Member/Viewer. Require an Admin-chosen wedding relationship: common labels plus Other with a required custom label (80 characters maximum). Preserve ADR-039's original-creator exemption; relationship never grants permissions. Pending invitations are separate from active members and task assignees.

Use the refined Stitch invitation modal/cards and acceptance states, keeping the existing logo, palette and typography. Replace demo single-click joining with matching verified email and an explicit Accept invitation button. Retain invitation context through login, duplicate-registration/missing-account transitions, registration and verification email, including another tab. Never force wedding setup for an invitee. Acceptance atomically joins the existing wedding; it never creates a wedding. Enforce one ACTIVE membership per account, and never overwrite an existing member's role/relationship through another invite.

Invitations expire exactly seven days after issue/resend. Resend rotates the link and expiry; revoke immediately disables acceptance. Both recheck the current record version. Prevent duplicate pending invitations for the same wedding/normalized email; normalize case without rewriting Gmail dots or aliases. Show submitted-to-provider versus delivery failure honestly: SMTP acceptance does not prove inbox receipt. Copy Link remains available to current Admins when delivery fails. Use bounded lists, rate limiting, a persisted 45-second resend cooldown, transactional audit and 24-hour idempotent business receipts. Never send email inside a retryable transaction or resend mail merely because a committed business request is retried.

## Tokens, authorization and retries

The browser URL is `/invite#token=…`; invitation tokens travel in JSON bodies, not HTTP paths/query strings. Auth continuation also uses fragments and fixed local routes, never arbitrary return URLs or browser storage. Only forward a verification-email continuation when the pending invitation matches the account email.

To implement later Copy Link without saving plaintext bearer tokens, derive each 256-bit token using purpose-separated HMAC-SHA256 over the invitation ID and a fresh random 256-bit nonce, keyed by the existing stable server authentication secret. Persist only the nonce and token hash. Database possession alone cannot reconstruct the token. Resend replaces nonce/hash; rotating the server secret invalidates old links. No new credential or client secret is introduced. Recheck the derived hash before returning a copyable URL. No raw tokens/private invitation receipts enter audit records or logs.

Public preview returns only the token-authorized recipient, role, relationship and minimal wedding/inviter display metadata, with explicit invalid/expired/revoked/accepted/unavailable states. Acceptance additionally requires an active verified account, matching normalized email, live wedding, an eligible issuing Admin and no other active wedding. Current Admin management and acceptance writes lock relevant account/member/wedding records and invitation state in the same transaction; unique indexes arbitrate races. Revalidate current authorization before receipt replay. Replays never restore removed access, change accepted roles or send mail again.

Creation/resend commit the invitation and an audit/receipt before bounded SMTP dispatch. Delivery status is updated only for that exact token generation. Interrupted dispatch remains visible as unconfirmed; an Admin can explicitly resend with a fresh link. This local synchronous dispatch boundary does not claim durable deployed delivery; review it with ADR-015's deployment prerequisites. Expiry is enforced on reads/writes even without a cleanup worker. Retain terminal invitation history; no expiry TTL deletes business records.

## Scope and verification

Owner-observation follow-up, 28 October 2026:

- Verification pages offer **Already verified? Sign in to continue**, preserving the valid invitation fragment through the existing fixed local login destination. Invalid/expired/used verification links remain unusable and generic; the navigation action does not claim email ownership or accept an invitation. The original invitation's accepted state retains authenticated access to the account's existing workspace.
- Browser testing reproduced invitation-fragment duplication when client navigation returned from registration to an already visited login route. Auth continuation links now use ordinary same-origin document navigation, and login/duplicate-registration outcomes use one fixed document replacement. This avoids merging old router fragments and rechecks the fresh cookie session; it introduces no arbitrary return URL, stored token or automatic joining.
- Tasks, Members and Admin invitation lists retain their last successful values only during a background request for the same account, wedding, role and query/page. A small refreshing label distinguishes this from initial loading. Changed scopes clear previous results; failed reads expose error/Retry rather than silently retaining outdated results. Invitation row actions pause until the refreshed status arrives. React memory remains the only storage; no cache/state-management dependency is introduced.

Connect Members' Invite Member and pending invitation controls and the dashboard shortcut. Refresh real members/assignees after acceptance through existing session reads. Preserve dirty/pending invitation attempts in React memory during recoverable session errors; pending writes cannot be dismissed. Used links offer workspace access only after normal authentication, without automatically accepting anything.

Verify strict input/role/relationship/token bounds, email privacy, current authorization, CSRF/origin/JSON boundaries, one-wedding/duplicate/concurrent acceptance, audit rollback, receipt replay, cooldown/rotation/revocation/expiry, SMTP failures and stale browser responses. Exercise the real service with a uniquely owned disposable database, stubbed email for automated/browser work, and production desktop/mobile auth continuation. Report actual email-inbox coverage separately. Role changes, member removal/reassignment, last-Admin mutation protection, export and deployment remain later scope.
