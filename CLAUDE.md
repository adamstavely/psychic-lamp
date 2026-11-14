# Donovan

npm workspaces: `packages/contracts` (Zod schemas shared by both apps), `apps/api` (NestJS 12, ESM), `apps/web` (Angular 22).

## Running it

```bash
npm run dev:deps     # Postgres, Elasticsearch and Keycloak in Docker
npm run start:api    # http://localhost:3200/api
npm run start:web    # http://localhost:4200, proxies /api to the API
```

Local sign-in is Keycloak at http://localhost:8180 (realm `donovan`, admin console `admin`/`admin`). Test users:
`alex`/`alex` (Alex Morgan) and `mara`/`mara` (Mara Lindqvist). The API applies database migrations on start; after
changing `apps/api/src/db/schema.ts`, run `npx drizzle-kit generate --name <change>` in `apps/api` and commit the SQL.

Checks CI runs: `npm run format:check`, `npm run lint`, `npm test`, `npm run build`, `npm run test:int`, `npm run e2e`.
Build `@donovan/contracts` first after changing it (`npm run build -w @donovan/contracts`); both apps import its `dist`.

## Conventions

- **Contracts first.** Every request and response shape is a Zod schema in `packages/contracts`. The API validates with
  it and the web app types its HTTP calls with it. Don't redeclare shapes in either app.
- **Web:** standalone components, `ChangeDetectionStrategy.OnPush`, signals (`input()`, `output()`, `computed()`,
  `resource`/`httpResource`), `@if`/`@for` control flow, `inject()`, one lazy route per area. Zoneless; no SSR.
- **Trench Coat first.** Use a Trench Coat element (`@adamstavely/trenchcoat/angular/<name>`, clean look) before writing
  UI. Only bugs and reusable components or features go into Trench Coat; Donovan-only layout stays here. Find components
  with `npx trenchcoat list <word>` and `npx trenchcoat info <name>`; `npm run lint:tc -w web` checks templates and tokens.
- **Styling:** Trench Coat tokens (`--tc-*`) only; Donovan's brand layer is `apps/web/src/theme/donovan.css` (`--dn-*`).
- **Trench Coat is vendored** in `vendor/`. Bump it with `npm run tc:vendor -- <version>`, never from a registry.
- **API:** ESM, relative imports end in `.js`. Unit tests are `src/**/*.spec.ts`; integration tests are
  `test/**/*.int-spec.ts` and run against the Docker services.

## Accessibility (WCAG 2.2 AA)

Every page gets a Playwright test that calls `expectNoAxeViolations` (`apps/web/e2e/a11y.ts`) in light and dark, and
keyboard paths are tested with real key presses. Text meets 4.5:1 (3:1 for large text and UI parts), targets are at
least 24×24px, nothing relies on colour alone, focus is always visible and never hidden behind sticky UI, and streamed or
changing content is announced through a polite live region. Where the mockup falls short, fix it and say so in the PR.
