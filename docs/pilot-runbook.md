# Donovan pilot runbook

How to run Donovan for a small pilot with real users, and what each control is for. It answers finding F7 of the
pilot readiness review (2026-11-14): the repository supplied a local stack only.

**Read this first.** The code-side controls below are built and tested. The deployment-side ones are provided as
images, configuration and steps, but **none of them has been applied to a real environment**. Before real user data
goes in, an owner works through [Before go-live](#before-go-live) in the deployed environment and records the result.

## What runs

| Piece         | Image / source                                 | Notes                                                       |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| Web front     | `apps/web/Dockerfile` (nginx, unprivileged)    | Serves the app and proxies `/api` with streaming unbuffered |
| API           | `apps/api/Dockerfile` (Node 24, non-root)      | `DONOVAN_ENV=production`; two or more replicas              |
| Migration job | Same image as the API, `node dist/migrate.js`  | Runs before each rollout; the API never migrates on start   |
| Postgres      | Managed service, private network, TLS          | The record. Backed up (see below)                           |
| Elasticsearch | Managed service, private network, TLS, API key | Search only; rebuilt from Postgres if lost                  |
| Identity      | Your OIDC provider (not the local Keycloak)    | The pilot's users only (see below)                          |

**Checked locally (2026-11-14), and in CI on every change:** both images build. The API image runs non-root on a
read-only filesystem, migrates with `node dist/migrate.js`, answers `/api/health` and `/api/health/live`, refuses
requests without a token, and with `DONOVAN_ENV=production` refuses plain-http identity and search, Elasticsearch
without a key, and the local database password. The web image runs read-only, writes `config.json` from its
environment, sends the security headers on every path, proxies `/api` (health through it answered 200), and the app
boots under its policy with no violations. **Not checked:** signing in through it (that needs an https identity
provider), the Kubernetes manifests (not applied to any cluster), and the ingress.

Example Kubernetes manifests are in `deploy/pilot/k8s` (namespace, config, Job, Deployments with probes, ingress with
TLS and streaming timeouts, network policies). They're a starting point to adapt.

## Built into the code

These are enforced by the API and covered by tests:

- **Production profile.** With `DONOVAN_ENV=production` the API refuses to start with the test reset, plain-http
  identity or search, Elasticsearch without an API key, the local database password, migrating on start, or no request
  limit. The test reset route can't be registered in production.
- **Readiness and liveness.** `/api/health` answers 503 when Postgres is down (search being down only degrades it,
  because search falls back to Postgres); `/api/health/live` only says the process is up. Each check gives up after 2 s.
- **Limits.** `RATE_LIMIT_PER_MINUTE` (default 600) requests per person per minute, then 429; `MAX_STREAMS_PER_USER`
  (default 3) answers streamed to one person at once. These are per instance and in memory: with N replicas a person
  can reach N times the budget. That's acceptable for a pilot; a larger rollout needs a shared store.
- **Logs.** Unexpected errors are logged as one JSON line with the request id, route, error type and database code,
  never the message, SQL parameters, body or headers. Every response carries `x-request-id`; a person reporting a
  problem can quote it.
- **Headers.** The API sends a `default-src 'none'` policy, `nosniff`, no framing, no referrer, `no-store`, and HSTS in
  production. The web front sends its own policy (scripts from itself only; it may talk to and frame only the identity
  provider for sign-in).
- **Sharing.** Projects can be shared with named people, to view; the API resolves recipients itself and refuses teams.
- **Search.** Reconciliation on start and every `SEARCH_RECONCILE_MINUTES` (15) repairs anything search missed.

## Configuration

API (environment):

| Variable                   | Production value                                             |
| -------------------------- | ------------------------------------------------------------ |
| `DONOVAN_ENV`              | `production`                                                 |
| `DATABASE_URL`             | Secret. A role with only the app's tables, `sslmode=require` |
| `ELASTICSEARCH_URL`        | `https://…` (private)                                        |
| `ELASTICSEARCH_API_KEY`    | Secret. An API key limited to the `donovan-*` indexes        |
| `ELASTICSEARCH_CA_PEM`     | Secret, if the cluster's certificate isn't from a public CA  |
| `OIDC_ISSUER`              | Your provider's issuer (`https://…`)                         |
| `OIDC_AUDIENCE`            | The audience your provider puts in Donovan's access tokens   |
| `MIGRATE_ON_START`         | `false` (the Job migrates)                                   |
| `RATE_LIMIT_PER_MINUTE`    | `600`, or what load testing supports                         |
| `MAX_STREAMS_PER_USER`     | `3`                                                          |
| `SEARCH_RECONCILE_MINUTES` | `15`                                                         |
| `ALLOW_TEST_RESET`         | Unset (production refuses `true`)                            |

Web (environment): `API_UPSTREAM` (the API service), `OIDC_AUTHORITY` (the issuer, https), `OIDC_CLIENT_ID`.

Secrets come from your secret store into a Kubernetes Secret (or equivalent) at deploy time. Nothing secret is in this
repository; the local `.env.example` values are for development only, and production refuses them.

## Identity provider

- Register two clients: the web app (public, Authorization Code + PKCE, redirect URI `https://<host>/`, web origin
  `https://<host>`) and the API audience.
- **Restrict access to pilot users.** Assign the web client to a pilot group only (Entra ID: "Assignment required" on
  the enterprise app, then assign the group; Okta: assign the app to the group; Keycloak: a client role or group, plus
  a policy that denies others). Everyone else is refused at sign-in, before Donovan sees them.
- Turn off self-registration on the realm or tenant used for the pilot.
- Token lifetimes: access tokens of 5 to 15 minutes; the web app renews them with refresh tokens.

## Rollout

1. Build both images from a tagged commit; scan them; push to your registry.
2. Run the migration Job with the new API image and wait for it to succeed. Migrations so far only add; they don't
   rename or drop anything the previous release reads, so the previous API keeps working against the migrated schema.
3. Roll out the API (`maxUnavailable: 0`), then the web front.
4. Check: `/api/health` is 200 through the ingress, a pilot user can sign in, send a message (it streams), open a
   project, and search.

## Rollback

- **Application:** roll the Deployments back to the previous image. Because migrations are additive (step 2 above),
  the previous release runs against the newer schema.
- **A migration that has to be undone:** restore from backup (below). Don't hand-edit the schema in production.
- Keep the last two releases' images and the migration Job manifests.

## Backups and restore

- **Postgres** holds everything. Use the managed service's point-in-time recovery with at least 7 days' retention,
  plus a nightly logical dump (`pg_dump --format=custom`) kept separately.
- **Elasticsearch** holds nothing that isn't in Postgres. If it's lost, create the cluster again; on start the API
  reconciles and rebuilds the indexes (500 documents per pass, every 15 minutes, until done). Search falls back to
  Postgres meanwhile.
- **Restore drill (do it before go-live, then quarterly):** restore the latest dump into a fresh database, point a
  staging API at it, and check a known person's chats, projects and artifacts are there. Record how long it took.

## Monitoring and alerts

Alert on:

- Readiness failing on any API pod for more than 2 minutes.
- 5xx responses above 1% of requests over 5 minutes (each logged with a request id).
- Error log lines (the `Errors` logger) above a few a minute.
- `SearchReconcile` reporting re-indexes on every pass for an hour (indexing is failing).
- 429s rising (limits too tight, or abuse).
- Postgres: storage, connections, replication lag, backup failures. Elasticsearch: cluster health not green.

Logs go to your log platform with the request id as a field. They're already free of message content; keep them on the
platform's access controls anyway.

## Ownership

Fill in before go-live:

| Area                               | Owner | Backup |
| ---------------------------------- | ----- | ------ |
| Service (on call for the pilot)    |       |        |
| Identity provider and pilot access |       |        |
| Database and backups               |       |        |
| Security review and sign-off       |       |        |

## Before go-live

Record each with who checked it and when.

- [ ] Deployed with `DONOVAN_ENV=production`; the API started (it refuses unsafe settings)
- [ ] `DELETE /api/test/me` returns 404 through the ingress
- [ ] TLS on the ingress; http redirects to https; HSTS present
- [ ] Postgres and Elasticsearch are on private addresses only, with TLS and least-privilege credentials
- [ ] Only pilot users can sign in (try with a non-pilot account: refused by the provider)
- [ ] A long answer streams to the end through the ingress (no buffering, no timeout)
- [ ] Stopping Postgres takes API pods out of rotation (readiness 503), and they return when it's back
- [ ] Error logs contain request ids and no message text (send a message, cause an error, read the log line)
- [ ] Restore drill done; time recorded
- [ ] Rollback rehearsed once on staging
- [ ] Alerts route to the on-call owner
- [ ] Manual accessibility checks from `docs/accessibility-audit.md` (screen readers, voice control) done
- [ ] Load test at the pilot's expected peak (not yet run)
- [ ] Dependency audit (`npm audit`, image scan) clean or accepted (not yet run)
- [ ] Penetration test, or an agreed exemption for the pilot (not yet run)

## Not covered yet

- Shared projects are view-only; editing together, and sharing with teams (which needs group membership from the
  identity provider in the access token), are later work.
- Request limits are per instance (see Limits above).
- Answers are still canned (simulated); a real model integration needs its own review for data handling and
  retention.
