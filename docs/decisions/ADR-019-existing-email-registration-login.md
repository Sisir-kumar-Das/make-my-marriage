# ADR-019: Existing registration emails lead to login

Date: 22 October 2026

Status: Accepted for local V1 development

## Context

Registration previously returned the same accepted response for new and existing emails under ADR-013. An already verified user therefore saw “Check your inbox” even though the backend correctly created no duplicate account and sent no email. The owner explicitly requested that submitting an existing email on Create account lead to login instead of the verification screen. “Sign in” in that request refers to the pictured registration submit button; the existing Sign in link already opens login.

## Decision

- Express checks the normalized email during registration. An existing email returns HTTP 409 with `EMAIL_ALREADY_REGISTERED`. A concurrent registration that loses the email uniqueness race returns the same conflict after confirming that the account exists.
- Treat verified, unverified and disabled existing accounts identically at registration. Never expose verification/disabled status, return account details, replace credentials/profile data, change a verification claim, send a registration email or issue a session for the duplicate request.
- The registration form clears its password fields and replaces the route with `/login?from=registration`. Login displays a short existing-account explanation and its normal password and Forgot password controls. The URL carries only a fixed display flag: no email, password or token. The flag is informational and cannot grant access.
- New registration retains its verification flow. Existing unverified accounts sign in with their existing password and use the verification reminder/resend flow; verification remains mandatory. Duplicate registration is not a resend action.
- Preserve existing Origin/JSON validation, IP/email limits, uniqueness enforcement and safe provider/configuration failures. Resend-verification and forgot-password keep their generic acknowledgements, including on delivery failure. Invalid login credentials remain generic.

## Privacy tradeoff and supersession

This deliberately exposes whether a submitted registration email is already registered, even without proof of mailbox ownership. It is the owner's requested usability choice and supersedes ADR-013's identical new/duplicate registration response only. It also qualifies ADR-018's retained generic-response wording for this endpoint. Rate limits reduce automated probing but do not eliminate disclosure. Revisit this decision before a wider public launch.

The approved PRD, API, database and system-design baselines remain unchanged. No standalone email-availability endpoint or client-side database lookup is introduced.

Follow-up, 24 October 2026: ADR-022 narrowly supersedes the generic missing-account login rule above at the owner's request. Unregistered login emails now lead to registration; the existing-email registration behavior in this decision remains unchanged.

## Verification

Native HTTP/service tests cover normalized existing-email conflicts and the duplicate-key race with no mail/cookies. Isolated Atlas checks cover unchanged credentials/verification claims across account states, concurrent registration uniqueness and retained generic resend failures. Browser checks should confirm that existing email submission reaches login without an inbox screen and that new registration still reaches verification, using only disposable accounts and fake delivery. Actual results and remaining limitations belong in PROJECT_STATUS.md.
