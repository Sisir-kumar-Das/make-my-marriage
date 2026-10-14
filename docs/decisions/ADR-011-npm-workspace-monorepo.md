# ADR-011: One npm-workspace repository with separate applications

- Status: accepted for local development
- Date: 13 October 2026
- Scope: initial runnable scaffold

## Decision

Use the existing repository as a minimal npm-workspace monorepo with `apps/web` and `apps/api`, JavaScript/JSX, ES modules, Node.js 24 LTS, npm and a single root lockfile. Each application has its own package manifest, environment example, runtime and eventual deployment boundary. There are no shared packages or monorepo build tools.

This supersedes the two-repository arrangement in System Design & Architecture v1.0 §4 and related two-repository references in §22/§26. The approved document remains unchanged as a historical baseline. The existing document relocation into `docs/` is preserved; this milestone does not move or rewrite those documents.

The browser calls REST endpoints under `/api/v1`; Express owns business logic, authorization and future MongoDB access. The frontend must not connect to MongoDB or import backend models.

Use explicit frontend routes for dashboard, events, tasks, checklist, members, profile, settings and recovery, with one shared layout. Dashboard data is synthetic and labelled. No feature CRUD/authentication, database or cloud dependency is required to run this milestone.

Follow API Design v1.0 §7.2 for the error envelope: `requestId` at the response root, plus `x-request-id` on all responses. This resolves the differing nested placement in the architecture document's API conventions.

## Deployment remains separate and unresolved

The intended future targets remain AWS Amplify for web and AWS Lambda/API Gateway with AWS SAM for API. Local approval explicitly includes stable Next.js 16; it does not authorize deployment or changing providers.

At scaffold time, [AWS's documented Amplify support](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html) lists Next.js through version 15. **Next.js 16 compatibility with Amplify remains unresolved.** Before deployment, recheck AWS's supported versions/features and validate the actual staging build/runtime. Do not claim compatibility based solely on local build success. [Next.js support policy](https://nextjs.org/support-policy) informs future version maintenance choices.

Next.js 16.4.0 was the latest stable release reported by npm at initial setup. Its Node requirement is >=20.9; the installed Node 24 runtime satisfies it. React and Tailwind use compatible stable versions captured in the root lockfile.

## Consequences

Development and tooling are coordinated from the root, while dependencies remain declared by the application that uses them. Later Amplify configuration must target `apps/web` and install from the root lockfile; later SAM packaging must target the API independently. Deployment configuration, Lambda adapters and infrastructure are deferred.

Auth/forms/database/integration libraries and later guest/RSVP, finance/vendor, accommodation, gallery, public-site, WhatsApp, AI and realtime modules are added only when implementing their agreed features. Docker, deployment workflows and the broader bootstrap suggested by the architecture document are outside this milestone.

Corrected Stitch HTML/assets were not available in `design/reference/` at scaffold time. The current shell is provisional; visual fidelity remains pending until the references are supplied.
