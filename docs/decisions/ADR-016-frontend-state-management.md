# ADR-016: Frontend state management

Date: 21 October 2026

Status: Accepted current approach; future libraries undecided

## Context

The user asked whether the project uses Redux/Redux Toolkit and agreed to retain the current approach while evaluating additional tools only when a feature needs them. This records the existing implementation and the criteria for revisiting it. It complements the approved frontend architecture and form-validation requirements without changing the baseline documents.

## Decision

- Use local React state for component behavior such as navigation menus, loading indicators, errors and confirmation screens.
- Use the existing `SessionProvider` React Context to share session information across workspace components. Express remains authoritative for account/session eligibility and authorization; client context is for presentation and coordination.
- Use React Hook Form with Zod for form values and client validation. Express validates authoritative input independently.
- Keep browser API calls in `apps/web/src/lib/api-client.js`. Preserve its session-refresh coordination and cookie/CSRF handling. Auth credentials remain in HttpOnly cookies; do not move them into a frontend store or browser storage.
- Redux and Redux Toolkit are not currently installed or used. Next.js does not remove the need to manage state; it does not require Redux either. Redux Toolkit is the modern Redux toolset, rather than a separate competing state-management choice.

## When to reconsider

When implementing real wedding, event and task data, assess concrete needs for cached API data, background refresh and keeping screens synchronized after mutations. TanStack Query is a candidate for those needs; it has not been selected or installed. Any adoption must preserve the central API-client boundary and authentication behavior.

If mutable client state must be coordinated across many unrelated components and local state/context becomes difficult to maintain, evaluate Redux Toolkit. No Redux migration is planned or authorized by this decision.

Keep API data caching separate from shared UI state when choosing a tool. Record the feature need and resulting decision here or in a subsequent ADR before introducing a new state-management dependency. A future candidate does not imply a committed library choice.

## Current implementation references

- `apps/web/src/components/layout/app-shell.jsx`: local menu state.
- `apps/web/src/features/auth/session-provider.jsx`: shared session context.
- `apps/web/src/features/auth/login-form.jsx`, `forgot-password-form.jsx` and `reset-password-form.jsx`: local UI state and React Hook Form/Zod.
- `apps/web/src/lib/api-client.js`: browser API requests and session/CSRF coordination.

This decision changes documentation only; it adds no dependency, store or runtime behavior.
