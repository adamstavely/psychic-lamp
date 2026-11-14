# Slice 2: Build, the registry and governance

The design source is still the Donovan prototype (`AI Super App UI Design – Donovan.html`, the 13 November build). Slice
2 makes Build mode real as a **registry with governance**: every Build section can be browsed, opened, registered into
and used from chat, and nothing new is published until two people other than its submitter have approved it. The
builders (Prompt Studio, the Workflow canvas and the Skill Builder) are slice 3. Model Studio's training and the app
switcher stay out of scope.

## Decisions

| Area            | Decision                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope           | Build shell; the shared catalog for skills, MCP servers, agents, workflows, models, datasets, spaces, collections and prompts; each section's detail page; the Register wizard; Governance (queue, policies, tiers); Insights; "Use in chat" from every item. The builders are slice 3. |
| Realism         | Like Assist: what people register, review, attach and use is stored by the API; running things (Try Tool, a Space's Run, an agent run) returns canned results.                                                                                                                          |
| Review          | **Two-person review.** A submission is published once two different people, neither of them the submitter, approve it. One "request changes" or "reject" stops it; the submitter can revise and resubmit, which starts the review again. Every decision is recorded with who and when.  |
| Who reviews     | Any signed-in person but the submitter (as chosen). Changing a governance policy needs the `donovan-admin` role from the identity provider's token (a Keycloak realm role locally).                                                                                                     |
| Data            | Postgres holds registry items (one table, a kind and a version per item, kind-specific fields as validated JSON), submissions and review decisions, and policy settings. Seeded from the prototype's data. Elasticsearch indexes registry items for ⌘K and catalog search.              |
| Sensitivity     | Items carry the same tiers as Assist. A collection's tier is its most sensitive member's.                                                                                                                                                                                               |
| Links to Assist | "Use in chat", "Attach to chat" and "Run in chat" open a new chat with that skill, server, model or agent picked. Chat blocks that point into Build (servers, models, agents, collections, workflows) open the item, replacing slice 1's "Coming in Build" state.                       |
| Quality         | As slice 1: Vitest, Playwright with axe on every page in light and dark, WCAG 2.2 AA, a failing-first test for every concurrency or privacy rule (review decisions, version bumps, scope filters).                                                                                      |
| Delivery        | One PR per step below; each merges itself when CI is green.                                                                                                                                                                                                                             |

## Steps

| #   | PR                     | What                                                                                                                                                                                              |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Plan                   | This document                                                                                                                                                                                     |
| 1   | Registry API           | Contracts for each kind, the registry tables and migration, seed from the prototype, list (scope Mine/Team/All, kind, query) and get endpoints, the search index and reconciliation, OpenAPI      |
| 2   | Build shell            | Assist/Build toggle enabled, the Build rail (11 areas with counts), a route per area and per item, ⌘K entries for Build areas and items                                                           |
| 3   | Catalog                | The shared catalog page: scope tabs, card and list views, status, sensitivity, stats, the primary action, Open, the area's context panel; "Use in chat" into a new chat with the item picked      |
| 4   | Servers and agents     | Server detail (Tools, Overview, Install tabs; Try Tool with simulated results; the Install modal); agent detail (servers and skills it uses, autonomy, Run in chat)                               |
| 5   | Models and data        | Model detail (card, Use, Files, Evals), datasets, spaces (Run, simulated), collections (members, tier ceiling, attach to a project)                                                               |
| 6   | Skills, prompts, flows | Read-only detail for skills (SKILL.md, tests, score), prompts (current version, history) and workflows (the graph, view only). Editing them is slice 3                                            |
| 7   | Register               | Register in the header, and its wizard (type, identity, kind-specific, governance, review); a submission is saved as pending review and shows in the submitter's "Mine" with its status           |
| 8   | Governance             | Queue with two-person review (approve, request changes, reject; who and when; publishing on the second approval; resubmission), policies (enforced where they apply, admin-only to change), tiers |
| 9   | Insights               | KPIs and usage computed from what's stored (chats, answers by model, tool calls, registry use), not the prototype's fixed numbers                                                                 |
| 10  | Accessibility pass     | Manual keyboard and screen-reader pass of Build mode, fixes, and an update to `docs/accessibility-audit.md`                                                                                       |

## Trench Coat coverage

Likely fits, to be mapped screen by screen in each step: `icon-rail` / `side-nav`, `segmented-control`, `facet-sidebar`,
`collection-card`, `skill-library`, `skill-detail`, `agent-gallery`, `agent-list`, `mcp-connection-manager`,
`tool-configuration`, `tool-permissions`, `test-run-panel`, `embed-configurator`, `model-access`, `eval-scorecard`,
`fact-sheet`, `schema-fields`, `stepper-form`, `review-queue`, `approval-chain`, `audit-trail`, `role-editor`,
`gate-config`, `kpi-board`, `metrics-dashboard`, `usage-meter`, `workflow-canvas` (view only), `version-history`.
Gaps that are reusable become Trench Coat releases; Donovan-only styling stays in the app.

## Not in slice 2

Prompt Studio editing, the Workflow canvas's editing and runs, the Skill Builder (slice 3); Model Studio training; real
MCP connections (Try Tool stays simulated); the app switcher.
