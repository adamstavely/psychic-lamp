# Slice 1: Assist

The design source is the Donovan prototype (`AI Super App UI Design – Donovan.html`). Slice 1 builds all of its
Assist mode; Build mode (skills, servers, agents, workflows, models, datasets, spaces, collections, prompts, insights,
governance) is later slices. The app switcher and Studio's on-device training are out of scope for now.

## Decisions

| Area        | Decision                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web         | Angular 22: standalone, signals, zoneless, OnPush, new control flow, a lazy route per area. Client-only (no SSR). Desktop only.                                                                                                  |
| UI          | Trench Coat (vendored), clean look and tokens, with a Donovan theme layer. Only bugs and reusable pieces go into Trench Coat, leaning toward reusable.                                                                           |
| API         | NestJS 12 (ESM). Postgres is the system of record (chats, messages, artifacts and their versions, projects, claims, approvals, preferences); Elasticsearch serves search (⌘K, chats, artifacts, sources).                        |
| Contracts   | Zod schemas in `packages/contracts`, used by both apps. The API also serves OpenAPI docs.                                                                                                                                        |
| Chat        | Canned answers replayed from the prototype's threads, streamed over server-sent events with realistic timing. A pending write-tool call pauses the stream until it's approved or denied.                                         |
| Auth        | OIDC, Authorization Code + PKCE in the browser; the API checks JWTs against the provider's JWKS. Keycloak runs locally with test users; the production provider is config.                                                       |
| Preferences | Theme, rail expanded, start mode, show governance and brief auto-open are per-user, stored by the API.                                                                                                                           |
| Quality     | Vitest unit tests, Playwright end-to-end with axe on every page in light and dark (CI fails on any violation), and manual keyboard and screen-reader passes. WCAG 2.2 AA; fixes that depart from the mockup are noted in the PR. |
| Delivery    | One PR per step below; each merges itself when CI is green.                                                                                                                                                                      |

## Steps

| #   | PR                     | What                                                                                                                                                                                   |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Scaffold               | Workspaces, lint and format, CI (`ci-ok` gate), vendored Trench Coat, Playwright + axe, this plan                                                                                      |
| 1   | API foundation         | Docker Compose (Postgres, Elasticsearch, Keycloak), config, JWT guard, migrations, Elasticsearch indexes, seed from the prototype's data, OpenAPI, `/me` and preferences               |
| 2   | Shell and sign-in      | OIDC sign-in, header (brand, Assist/Build toggle with Build disabled, ⌘K, New chat, theme, notifications, profile), rail with pinned and recent chats, toasts, skip link and landmarks |
| 3   | Daily Brief            | Donovan's read, summary chips, changed since yesterday, needs you, memos, saved searches, today's meetings, pick up where you left off, ask box                                        |
| 4   | Chat thread (read)     | Chat list, thread header, routing chips, every block renderer (text, list, tool, skill, claims, table, chart, code, artifact, steps, workflow, server, model, collection, agent)       |
| 5   | Composer and streaming | New-chat home, auto routing and manual overrides, attach, sensitivity, starters, streaming, approvals, copy, versions, feedback, context window                                        |
| 6   | Session panel          | Session intent, claims (confirm and dispute), calibrated mode, verification checkpoint, artifacts, sources, metadata, export with provenance                                           |
| 7   | Artifacts              | Artifact pane (versions, copy, download, wide view, save to project), the Artifacts area with filters, details and upload                                                              |
| 8   | Projects               | Org-shared libraries, your projects, project detail (sources, notes, calibrated mode, share)                                                                                           |
| 9   | Accessibility audit    | Manual keyboard and screen-reader pass of every area, fixes, and `docs/accessibility-audit.md`                                                                                         |

Cards that point into Build mode (servers, models, agents, collections, workflows) show a "Coming in Build" state.

## Trench Coat coverage

Most of Assist maps onto existing elements: `header-brand`, `header-nav`, `command-menu`, `icon-rail` / `side-nav`,
`session-list`, `notifications`, `profile-menu`, `toaster`, `digest`, `away-summary`, `decision-card`, `stories`,
`saved-search-alerts`, `chat-composer`, `prompt-starters`, `model-routing`, `model-picker`, `thread-header`,
`run-receipt`, `tool-call-card`, `approval-card`, `permission-request`, `claim-answer`, `citation-badge`, `code-block`,
`data-table`, `chart`, `message-actions`, `context-window`, `session-tabs`, `panel-dock`, `reflection-gate`,
`run-manifest`, `sensitivity-label-picker`, `artifact-panel`, `version-history`, `project-card`, `share-panel`.
Each step maps its screen in detail first; gaps that are reusable become Trench Coat releases.
