# ADR-035: Checklist template catalog and preview

Date: 27 October 2026

Status: Owner approved implementation of Checklist Step 1 after accepting the Tasks checkpoint. Verification and acceptance are recorded in PROJECT_STATUS.md.

Step 2 follow-up: [ADR-036](ADR-036-explicit-checklist-generation.md) implements explicit Admin/Family generation with preserved/deleted identities and safe retries. The owner accepted Step 1; the read-only/Coming soon descriptions below record its original delivery. Step 3 under [ADR-037](ADR-037-checklist-generation-history.md) subsequently delivers read-only generation-history browsing. The descriptions below retain the original Step 1 scope.

## Scope and content

Deliver browsing and preview only: Initial Planning, Venue & Logistics, Photography & Video, and Attire & Jewellery. The owner explicitly accepted four generic V1 packs and keeping Essential Odia Wedding Rituals visible as Coming soon; culture-specific packs and reusable user-created templates remain later scope. The initial version has six actual items per available pack, with stable item keys, titles, descriptions, suggested priorities and optional future wedding-relative timing represented as daysBeforeWedding. These are curated starting points, not mandatory practices or saved tasks/deadlines.

Follow the baseline system architecture: templates live as versioned backend source/config, not editable database records. Every pack has an immutable id and a version string. Keep item keys stable across wording changes; settle version/regeneration semantics before enabling generation. Derive displayed task counts from actual items. Planned packs expose no fake task count or task list. There is no mutation endpoint, task write, new collection or schema/index change in this increment.

## API and boundaries

GET /api/v1/checklist-templates returns the bounded catalog and planned-pack metadata through the ordinary response envelope. Reuse Express session authentication and no-store/trusted-origin behavior; require a current verified account as enforced by the existing session service. The global generic catalog contains no account, wedding or membership records. Admin, Family Member and Viewer receive identical read-only content. Reject unsupported query fields. Return independent copies so a caller cannot mutate later reads.

The web uses api-client only, local React state and the existing shared session provider. Preserve both workspace layout and page-level SSR/RSC guards at /checklist: signed-out visitors restore/sign in; verified accounts without an active wedding use setup. No new credentials, dependency, state library or browser persistence.

## Visual reference and entry points

Use the corrected make_my_marriage_tasks_checklist_templates_refined catalog and make_my_marriage_checklist_templates_generation_history detail-inspection panel, inside the existing refined shared shell (ADR-021). Preserve the approved full M logo, palette, Inter/Playfair typography, photo cards, selected states and responsive layout. The owner-approved generic Initial Planning card uses the existing local brand couple artwork; retain the original Stitch artwork locally for venue, photography, attire and the planned Odia card.

Sidebar Checklist, Tasks Browse Templates and Tasks Checklist Templates all open /checklist. The catalog also provides All Tasks/My Tasks return links. Preview selection displays the entire selected pack, real priority counts and suggested relative timing; keyboard focus and scrolling reveal the selected preview on phones. Browsing never changes the wedding plan. Loading and failure/Retry states must not present stale demo records as a successful catalog load.

Generate Tasks stays disabled with visible Coming soon for every role. The generation-history area is an empty Coming soon preview. Remove the replaced all-disabled catalog component; retain unrelated planning previews. Never copy Stitch's simulated imports, historical rows, fabricated counts or unimplemented duplicate/sync guarantees into product behavior.

## Verification and next checkpoint

Native tests protect stable unique item identities, valid counts/priorities/timing, isolation between reads, session/origin requirements, all-role access, lack of tenant data and lack of generation writes. Browser-check all three entry points, every preview, keyboard focus, artwork, phone/tablet layouts, reload, unavailable API/Retry and all member roles with disposable data. Confirm no task is generated. Record actual lint/format/build/smoke/startup/browser results and limits in PROJECT_STATUS.md.

Next: owner review of catalog/preview, then discuss and implement explicit generation, safe repeat generation and history in the agreed increments. Future generation permissions and existing-task/deleted/version identity behavior must be settled before enabling writes. The API baseline permits Admin/Family generation while an older system-design paragraph mentions Admin; this read-only increment introduces no write permission. No commit, push, deployment or production-scheduling change is authorized here.
