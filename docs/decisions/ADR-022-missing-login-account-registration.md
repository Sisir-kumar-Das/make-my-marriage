# ADR-022: Unregistered login emails lead to registration

Date: 24 October 2026

Status: Accepted by the owner for local V1 implementation

## Context and owner direction

After reviewing the sign-in screen, the owner explicitly requested that submitting an email without an account open registration with a clear explanation. This complements ADR-019's reverse flow: duplicate registration opens login. The owner accepted that this reveals whether an email is registered.

## Decision

- Express checks the normalized email in the existing POST `/auth/login` endpoint. If no user exists, return HTTP 404 `ACCOUNT_NOT_FOUND` with “You don’t have an account yet. Please create one to continue.” Retain dummy password-hash verification for missing accounts and the existing validation, Origin, JSON, CSRF and IP/email rate limits.
- The browser clears the login password and replaces the route with `/register?from=login`. Registration displays the explanation. The URL carries only a fixed informational flag, never an email, password or token. The flag cannot create an account, verify an address or grant access.
- An existing account with a wrong password or disabled status retains HTTP 401 `INVALID_CREDENTIALS`. An active unverified account with the correct password retains HTTP 403 `EMAIL_NOT_VERIFIED` and the resend action. A verified eligible account still receives its normal session and workspace/setup destination.
- Unknown-email login never creates or changes a user, token, membership or session and never sends mail. The user must complete the normal registration and verification flow. Keep resend/forgot responses generic and preserve ADR-019's existing-email registration behavior.
- Simplify the login-only verification reminder to one email input plus explanatory text and a resend action; registration and standalone verification forms retain their own email controls. Editing the login email clears the previous verification reminder.

## Tradeoff and supersession

This deliberately discloses account existence through the login response and redirect, even without mailbox ownership. Rate limiting does not remove that disclosure. It narrowly supersedes ADR-014/ADR-019's generic missing-account login behavior; wrong-password/disabled responses and all other auth decisions remain in force. Preserve the approved PRD, API, database and system-design baselines; this ADR records the owner's explicit exception. No email-availability endpoint, frontend database access or state-management dependency is introduced.

## Verification

Native service/HTTP checks cover the missing-account distinction, normalized input, unchanged wrong/disabled/unverified behavior and absence of authentication cookies or mutations. The isolated Atlas session suite and browser checks cover actual authentication and navigation. Record results and limitations in PROJECT_STATUS.md.
