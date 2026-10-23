# ADR-018: Gmail SMTP for a small personal project

Date: 22 October 2026

Status: Implemented locally; SMTP authenticated and test inbox receipt confirmed; deployment deferred

Subsequent UX decision, 22 October: [ADR-019](ADR-019-existing-email-registration-login.md) changes duplicate-registration responses to a sign-in conflict. Generic resend/forgot responses and this provider boundary remain intact; the provider transition itself did not introduce that disclosure.

## Context

The owner expects fewer than 20 users, primarily trying a personal demonstration of the application. The goal is a polished product with sound authentication and modest running costs. The current Resend test sender rejects recipients other than the Resend account's own address. The owner does not currently own a sending domain and selected a dedicated Gmail account to avoid purchasing a domain solely for email at this stage.

The approved PRD, API design and system architecture select Resend. The architecture's EmailService boundary explicitly allows the provider to be replaced without changing domain logic. Preserve those approved baseline documents. This ADR supersedes the email-provider selection for this project's small-scale use; it does not change V1 features or authentication requirements.

## Decision

- Use a project Gmail account with Gmail SMTP for development and the intended small live demonstration. After Google's security verification delayed the newly created account, the owner selected an existing test Gmail account, prepared its App Password and supplied settings privately.
- Implement sending in the Express email adapter, using Nodemailer and Google 2-Step Verification with a separate App Password. The owner creates the account and credential themselves. SMTP credentials belong only in the ignored API environment file; never request them in chat, put them in browser code or log them.
- Keep the sender aligned with the authenticated Gmail account. No purchased domain is required for this Gmail sender. Changing EMAIL_FROM alone cannot switch the existing Resend implementation to SMTP.
- Preserve email verification, password reset and password-change notification templates, trusted-origin links, token hashing/expiry/single use, generic public acknowledgements, cooldowns, transaction boundaries and safe provider errors. Future invitations must use the same backend email boundary when implemented.
- Keep provider selection separate from business logic so a domain-backed transactional service can be selected later if delivery or usage requires it. A provider switch must be explicit; do not automatically send through multiple providers after an ambiguous delivery result.
- Gmail SMTP has no equivalent of Resend's HTTP idempotency key. Retain application token claims/cooldowns and do not add blind automatic resend attempts following an uncertain SMTP result. Verification/recovery remains retryable through its existing application flows.

## Implemented provider configuration

- `EMAIL_PROVIDER=gmail` selects Nodemailer 10.2.1 in the API workspace. Private `SMTP_USER` and `SMTP_APP_PASSWORD` are required; the loader trims/normalizes the account and removes Google's display spaces from the 16-character App Password. Invalid or missing settings fail safely before registration/recovery database work. The Gmail From address is the authenticated SMTP account with the existing Make My Marriage display name; old Resend sender settings are ignored in Gmail mode.
- Gmail transport uses `smtp.gmail.com:465`, TLS with certificate verification and minimum TLS 1.2, bounded DNS/connect/greeting/socket phase timeouts, no pool, and disabled protocol/debug logging and file/URL content access. An unaccepted recipient or transport failure becomes the existing safe EMAIL_UNAVAILABLE error, without logging private provider responses. SMTP acceptance is not represented as guaranteed inbox delivery.
- `EMAIL_PROVIDER=resend` retains the existing fixed-endpoint fetch adapter, RESEND_API_KEY/EMAIL_FROM requirements and per-token provider idempotency keys. An omitted provider defaults to Resend for existing environment compatibility; the example and current private local configuration explicitly select Gmail. Unknown provider values fail startup with a credential-free configuration error.
- Verification, reset and password-change messages use the same provider boundary. Registration/resend/recovery preflight checks now evaluate the selected provider rather than requiring a Resend key unconditionally. HTTP contracts, templates, token/security behavior and generic public acknowledgements are preserved.

## Cost and delivery tradeoffs

Personal Gmail avoids the domain-purchase requirement and paid email-service subscription for this small project. This is a deliberate low-volume tradeoff, not a delivery guarantee. Google applies account-wide limits and can reject automated sign-ins or messages; fewer than 20 users does not establish an email quota or guarantee inbox placement. Messages show the Gmail sender address.

Gmail is not a transactional-email reliability service. Reassess the choice if authentication messages become unreliable or usage grows. Existing deployment prerequisites, including durable recovery dispatch, HTTPS and rate-limit infrastructure, remain separate. No hosting change or deployment is authorized by this decision.

## Current state and completion criteria

Implemented and checked on 22 October. The owner privately populated the Gmail settings, and SMTP connection/authentication passed without sending a message. With explicit owner approval, a disposable isolated-database flow sent exactly three emails to the approved other mailbox: verification, reset and password-change confirmation. The owner confirmed receiving all three. The service/HTTP checks verified the account, reset its password, rejected the old password and used link, revoked its existing session and logged in with the new password; its test database was removed. Tokens were consumed through the HTTP test client, not by an agent opening the owner's inbox/browser links. A fresh manual inbox-to-browser click remains a distinct optional acceptance check.

Atlas testing initially encountered Node's EBADRESP SRV DNS failure. After approved system-resolver diagnostics and a successful temporary standard-URI check, the owner authorized changing only the private connection-string format to the same cluster with its existing credentials/options and TLS. No application database, system DNS or hosting setting was changed. Normal saved-configuration registration/recovery suites then passed. If Atlas seed endpoints/topology change, obtain an updated driver connection string; this local format change does not alter the approved MongoDB Atlas architecture.

Verification and continuing requirements:

1. Keep the sender account's App Password private and use the same backend settings for verification and recovery.
2. Retain adapter/configuration tests for message composition, missing configuration, private SMTP failures, no automatic retry/fallback, TLS/timeouts and trusted fragment links, alongside registration/recovery regressions.
3. Keep SMTP authentication, server acceptance, user-confirmed inbox receipt and manual browser-link validation distinct in progress reports. A fresh manually opened verification/reset link was not tested by this increment.
4. Record actual results and remaining limits in PROJECT_STATUS.md. Do not send further real test emails without the owner's instruction for the intended recipient.

## References

- [Approved architecture, EmailService boundary](../Make_My_Marriage_System_Design_Architecture_v1.0.md#141-resend).
- [Google: enable 2-Step Verification](https://support.google.com/accounts/answer/185839?hl=en).
- [Google: create and use App Passwords](https://support.google.com/accounts/answer/185833?hl=en).
- [Nodemailer: Gmail integration, authentication and operational limits](https://nodemailer.com/guides/using-gmail).

This increment changes the backend email adapter/configuration, adds one API dependency and updates tests/setup documentation. It does not add frontend pages, app-user 2FA, invitation functionality, a durable queue or deployment. Commit and push require a separate user instruction.
