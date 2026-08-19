# proxy-control

Web panel to **govern the domains of [Nginx Proxy Manager](https://nginxproxymanager.com/) (NPM)**,
distinguishing **public** and **private** domains and keeping them in sync with the system that
resolves each type:

- **Public** → registered first in **Cloudflare** (DNS), then in **NPM**.
- **Private** → registered in the **Mikrotik** (RouterOS 7, static DNS), then in **NPM**.

The app reads the domains from NPM, shows them in a table with their sync state and, visually, whether
they are active in Cloudflare (public) or in the Mikrotik (private), and offers **reconciliation**
actions when there are divergences.

> Design and detailed decisions: **[`AGENTS.md`](./AGENTS.md)** (symlink: `CLAUDE.md`) and
> **[`IMPLEMENTATION.md`](./IMPLEMENTATION.md)**.

## Stack

- **Astro 7** with **SSR** (`@astrojs/node` adapter in `standalone` mode).
- **Preact 10** for interactive components (islands).
- **Tailwind CSS 4** (via `@tailwindcss/vite`, configured with `@theme`).
- **Postgres** with **Drizzle ORM** (versioned migrations).
- **Node 24+**.
- **Observability**: Prometheus metrics (`prom-client`) at `/metrics`, JSON logs to stdout collected
  by **Grafana Alloy** → **Loki**, visualization in **Grafana**, and alerting via **Alertmanager**.

## Architecture

```
Browser (Preact islands)
      │  fetch()
      ▼
Astro SSR endpoints (src/pages/api/*.ts)   ← all integration logic
      │
      ├─ Providers (src/server/providers/)
      │     ├─ npm.ts         → Nginx Proxy Manager API
      │     ├─ cloudflare.ts  → Cloudflare API (public domains)
      │     └─ mikrotik.ts    → RouterOS 7 REST API (private domains)
      │
      ├─ Reconciliation (src/server/…)  → compares desired vs actual state
      └─ Persistence (src/server/db/)   → Postgres (metadata and desired state)
```

**Source of truth**: NPM is the domain list; our DB stores the *type* (public/private), the *desired
state*, and the result of the last reconciliation. Network/integration logic runs **only** on the
server.

## Getting started

### With Docker (recommended)

The **dev** stack is self-contained: app with hot-reload + Postgres + full observability (Grafana,
Prometheus, Loki, Alloy, Alertmanager).

```sh
npm run docker:dev
# same as: docker compose -f infra/dev/compose.yml up --build
```

Services exposed locally:

| Service    | URL                    |
| :--------- | :--------------------- |
| App        | http://localhost:4321  |
| Grafana    | http://localhost:13000 |
| Prometheus | http://localhost:19090 |
| Loki       | http://localhost:13100 |
| Postgres   | `localhost:15432`      |

### Local (without Docker)

Requires a reachable Postgres and the environment variables in a root `.env`.

```sh
npm install
npm run db:migrate     # apply Drizzle migrations
npm run dev            # dev server at http://localhost:4321
```

## Environment variables

In dev they are read from a root `.env` (do not commit). The **DNS provider** secrets
(Cloudflare/Mikrotik) are **not** passed via env: they are stored encrypted in the DB and edited from
the panel (**Settings → DNS Providers**).

```sh
DATABASE_URL=postgresql://user:pass@host:5432/db
NPM_BASE_URL=http://npm.lan:81
NPM_EMAIL=...
NPM_PASSWORD=...
SESSION_SECRET=...     # signs the session cookie
SETTINGS_KEY=...       # REQUIRED: encrypts (AES-256-GCM) the provider secrets in the DB
AUTH_ENABLED=true      # false → disables login (LAN-only use)
```

Generate the access password hash with `npm run auth:hash`.

## Commands

| Command               | Action                                            |
| :-------------------- | :------------------------------------------------ |
| `npm run dev`         | Dev server at `localhost:4321`                    |
| `npm run build`       | Production build to `./dist/`                     |
| `npm run start`       | Run the build (`node ./dist/server/entry.mjs`)    |
| `npm run typecheck`   | `tsc --noEmit`                                     |
| `npm run format`      | Prettier `--write` over the whole repo            |
| `npm run db:generate` | Generate migrations from the schema (Drizzle Kit) |
| `npm run db:migrate`  | Apply migrations                                  |
| `npm run db:studio`   | Open Drizzle Studio                               |
| `npm run auth:hash`   | Generate the argon2 hash of the access password   |
| `npm run docker:dev`  | Full dev stack in Docker                          |
| `npm run docker:prod` | Prod stack (usually via pi-infra)                 |

## Docker labels discovery

Optionally, proxy-control can **discover and register domains from Docker container labels**
(Traefik-style). Enable it with `DOCKER_LABELS_ENABLED=true` and mount the Docker socket
read-only into the container (already wired in the dev/prod compose):

```yaml
volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
```

Detection is **hybrid**: an initial scan on boot, a live **event stream** (reacts to
`start`/`stop`/`die`/`destroy`/`update`, debounced), and a periodic **resync** as a safety net,
with reconnect + backoff if the stream drops. You can also trigger a scan on demand with the
**"Descubrir Docker"** button (or `POST /api/discover`).

Semantics:

- **Upsert by hostname.** A labeled container creates or updates its domain and reconciles it
  (DNS → NPM), reusing the normal flow. Domains gain a `docker` badge in the table.
- **Non-destructive orphans.** When a container disappears, its domain is **marked `huérfano`**
  (not deleted); the NPM proxy host and DNS entry are left intact for you to review. Filter them
  with the toolbar's **Origen → Huérfanos**.
- **Manual override.** Editing a Docker-managed domain from the UI **detaches** it
  (`source` → `manual`) so the label sync no longer overwrites your change.
- **Errors don't block the fleet.** A container with `enable=true` but invalid/incomplete labels
  is skipped and reported (log + toast), without affecting the rest.

### Label reference

Policy (v1): **everything explicit** — `visibility`, `forward.host` and `forward.port` are
required, no inference. One hostname per container. The prefix (`proxy-control` by default) is
configurable via `DOCKER_LABEL_PREFIX`.

| Label (under `<prefix>.`)       | Required | Values / notes                                   |
| :------------------------------ | :------: | :----------------------------------------------- |
| `enable`                        |    ✅     | `true` — gate; without it the container is ignored |
| `hostname`                      |    ✅     | e.g. `app.domain.es`                             |
| `visibility`                    |    ✅     | `public` \| `private`                            |
| `forward.host`                  |    ✅     | upstream host reachable **from NPM**             |
| `forward.port`                  |    ✅     | `1`–`65535`                                       |
| `forward.scheme`                |          | `http` \| `https` (default `http`)               |
| `ssl.certificate-id`            |          | numeric id of an existing NPM certificate        |
| `cf.zone-id`                    |          | Cloudflare zone (public); else provider default  |
| `cf.record-type`                |          | `A` \| `CNAME`                                    |
| `cf.content`                    |          | IP (A) or target host (CNAME)                    |
| `cf.proxied`                    |          | `true` \| `false`                                |
| `advanced-config`               |          | raw nginx config for the proxy host              |
| `npm.block-exploits`            |          | `true` \| `false` (Block Common Exploits)        |
| `npm.websockets`                |          | `true` \| `false` (Websockets Support)           |
| `npm.cache-assets`              |          | `true` \| `false` (Cache Assets)                 |
| `npm.http2`                     |          | `true` \| `false` (HTTP/2 Support)               |
| `npm.hsts`                      |          | `true` \| `false` (HSTS Enabled)                 |
| `npm.hsts-subdomains`           |          | `true` \| `false` (HSTS include subdomains)      |
| `npm.force-ssl`                 |          | `true` \| `false` (Force SSL)                    |
| `npm.trust-forwarded-proto`     |          | `true` \| `false` (trust `X-Forwarded-Proto`)    |

**Custom locations** are declared with indexed labels (`location[0]`, `location[1]`, …):

| Label (under `<prefix>.location[N].`) | Required | Values / notes                       |
| :------------------------------------ | :------: | :----------------------------------- |
| `path`                                |    ✅     | e.g. `/ws`                           |
| `forward.host`                        |    ✅     | upstream host for this location      |
| `forward.port`                        |    ✅     | `1`–`65535`                          |
| `forward.scheme`                      |          | `http` \| `https` (default `http`)   |
| `advanced-config`                     |          | raw nginx config for this location   |

Omitted NPM flags fall back to the app defaults (all protections on). See a full example in
[`examples/docker-labels/compose.yml`](./examples/docker-labels/compose.yml).

### Discovery environment variables

| Variable                    | Default                  | Notes                                         |
| :-------------------------- | :----------------------- | :-------------------------------------------- |
| `DOCKER_LABELS_ENABLED`     | `false`                  | Master switch for the feature                 |
| `DOCKER_LABEL_PREFIX`       | `proxy-control`          | Label namespace                               |
| `DOCKER_SOCKET_PATH`        | `/var/run/docker.sock`   | Unix socket to the daemon                     |
| `DOCKER_HOST`               | —                        | `tcp://host:port` alternative to the socket   |
| `DOCKER_RESYNC_INTERVAL_MS` | `60000`                  | Safety-net full resync interval               |
| `DOCKER_EVENT_DEBOUNCE_MS`  | `500`                    | Coalesce a burst of events into one sync      |

## Observability

The app exposes `/metrics` (Prometheus) and `/health`. In the dev stack, the
**proxy-control · Overview** Grafana dashboard shows app status, domains by state, reconciliations,
and logs.

> **Note (dev only):** the Astro dev server runs on Vite, which rejects requests with **403** when
> the `Host` header is not in `allowedHosts`. Since Prometheus scrapes `/metrics` by the Docker
> service name (`proxy-control`), that host is explicitly allowed in `astro.config.mjs`
> (`vite.server.allowedHosts`). Without that entry, `up{job="proxy-control"}` is 0 and the metrics
> panels stay empty. Not applicable in prod (standalone build, no Vite).

## Deployment / infra

Everything deployment-related lives in **`infra/`** (shared multi-stage Node 24 Dockerfile). Two
environments: **dev** (self-contained) and **prod** (integrated with the `pi-infra` core, using its
Postgres/pgbouncer and Grafana). See details in [`AGENTS.md`](./AGENTS.md).

## Code standards

Prettier 3 (4 spaces, no `;`, single quotes, `trailingComma: all`, printWidth 120) plus the structure
conventions described in [`AGENTS.md`](./AGENTS.md). Run `npm run format` after any change.
