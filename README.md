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
required, no inference (except in `dns-only`, see below). One hostname per container. The prefix
(`proxy-control` by default) is configurable via `DOCKER_LABEL_PREFIX`.

| Label (under `<prefix>.`)       | Required | Values / notes                                   |
| :------------------------------ | :------: | :----------------------------------------------- |
| `enable`                        |    ✅     | `true` — gate; without it the container is ignored |
| `hostname`                      |    ✅     | e.g. `app.domain.es`                             |
| `visibility`                    |    ✅     | `public` \| `private`                            |
| `forward.host`                  |   ✅¹     | upstream host reachable **from NPM**             |
| `forward.port`                  |   ✅¹     | `1`–`65535`                                       |
| `forward.scheme`                |          | `http` \| `https` (default `http`)               |
| `dns-only`                      |          | `true` — register DNS only, **no NPM proxy host** (no SSL/upstream) |
| `address`                       |   ✅²     | target IPv4 for the Mikrotik static A record (`dns-only` private) |
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

¹ Not required when `dns-only=true` (there is no proxy host). ² In `dns-only` **private**,
`address` is the IP the hostname resolves to; in `dns-only` **public** the target is
`cf.content` instead (required). `dns-only` registers only the DNS record (Cloudflare for
public, Mikrotik for private) and skips NPM entirely.

Omitted NPM flags fall back to the app defaults (all protections on). See a full example in
[`examples/docker-labels/compose.yml`](./examples/docker-labels/compose.yml).

### Discovery environment variables

| Variable                    | Default                  | Notes                                         |
| :-------------------------- | :----------------------- | :-------------------------------------------- |
| `DOCKER_LABELS_ENABLED`     | `false`                  | Master switch for the feature                 |
| `DOCKER_LABEL_PREFIX`       | `proxy-control`          | Label namespace                               |
| `DOCKER_HOSTS`              | —                        | Multi-host: comma-separated `name=url` list (takes priority) |
| `DOCKER_SOCKET_PATH`        | `/var/run/docker.sock`   | Single host: unix socket to the daemon        |
| `DOCKER_HOST`               | —                        | Single host: `tcp://host:port` alternative to the socket |
| `DOCKER_RESYNC_INTERVAL_MS` | `60000`                  | Safety-net full resync interval               |
| `DOCKER_EVENT_DEBOUNCE_MS`  | `500`                    | Coalesce a burst of events into one sync      |

**Multiple hosts.** Set `DOCKER_HOSTS` to a comma-separated list of `name=url` entries to
watch several Docker daemons at once (it takes priority over `DOCKER_HOST`/`DOCKER_SOCKET_PATH`).
Each `url` accepts `tcp://host:port`, `unix:///path.sock`, or a socket path; the `name` labels
metrics/status and is remembered per discovered domain, so **don't rename a host afterwards**.
One event stream runs per daemon (each with its own backoff), and the sync is failure-isolated:
if a host is unreachable its domains are **never** marked orphaned in that pass. Example:
`DOCKER_HOSTS=local=unix:///var/run/docker.sock,pi2=tcp://192.168.1.20:2375`.

## File-based discovery (YAML)

For services that are **not containers** (Proxmox / TrueNAS web panels, a switch, a printer…),
declare them in YAML. A file watcher reads them with the **same engine** as Docker discovery
(watch + reconcile: create / update / orphan), tagging rows as `source: 'file'`.

`FILE_DOMAINS_PATH` may be a single `.yaml`/`.yml` file or a **directory** of them (all `*.yaml`
/`*.yml` are read). Removing an entry marks its domain **orphaned** (never auto-deleted); if the
path can't be read, nothing is orphaned that pass.

```yaml
# domains.d/panels.yaml
domains:
    - hostname: pve-web.negri.es
      visibility: private
      forward: { scheme: https, host: 192.168.1.10, port: 8006 }
      npm: { websockets: true } # Proxmox noVMC console needs websockets
    - hostname: nas-web.negri.es
      visibility: private
      forward: { scheme: https, host: 192.168.1.20, port: 443 }
    - hostname: app.negri.es # public: Cloudflare + new Let's Encrypt cert
      visibility: public
      forward: { scheme: http, host: 10.0.0.5, port: 8080 }
      cloudflare: { recordType: A, content: 203.0.113.10, proxied: true }
    - hostname: nas.negri.es # DNS only (private): Mikrotik A record, no NPM proxy host
      visibility: private
      dnsOnly: true
      address: 192.168.1.20 # IPv4 the hostname resolves to (required)
    - hostname: cdn.negri.es # DNS only (public): Cloudflare record only, no proxy/SSL
      visibility: public
      dnsOnly: true
      cloudflare: { recordType: A, content: 203.0.113.5, proxied: false } # content required
```

Per-entry fields: `hostname`, `visibility` (`public`|`private`), `forward.{scheme,host,port}`
(required `host`/`port`, **except when `dnsOnly: true`**), optional `ssl.certificateId`,
`advancedConfig`, `npm.{blockExploits,websockets,cacheAssets,http2,hsts,hstsSubdomains,forceSsl,
trustForwardedProto}`, `locations[]` (`path` + `forward.{scheme,host,port}` + `advancedConfig`),
and `cloudflare.{recordType,content,proxied,zoneId}` (public only). **`dnsOnly: true`** registers
only the DNS record and skips NPM (no proxy host, SSL or upstream): private uses `address` (target
IPv4, required); public uses `cloudflare.content` (required). Unknown keys are rejected; a bad
entry is skipped and reported
without failing the rest of the file. Template: [`infra/prod/domains.d/panels.yaml.example`](./infra/prod/domains.d/panels.yaml.example).

### File-discovery environment variables

| Variable                  | Default             | Notes                                       |
| :------------------------ | :------------------ | :------------------------------------------ |
| `FILE_DOMAINS_ENABLED`    | `false`             | Master switch for the feature               |
| `FILE_DOMAINS_PATH`       | `/config/domains.d` | A `.yaml`/`.yml` file or a directory of them |
| `FILE_RESYNC_INTERVAL_MS` | `60000`             | Safety-net full resync interval             |
| `FILE_EVENT_DEBOUNCE_MS`  | `500`               | Coalesce a burst of file changes into one sync |

In prod, `infra/prod/domains.d/` is version-controlled and the `sync-pi-infra` workflow mirrors
it to `pi-infra → apps/proxy-control/domains.d/`, which `compose.yml` mounts read-only at
`/config/domains.d`. Add real `*.yaml` files there and enable `FILE_DOMAINS_ENABLED=true`.

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
