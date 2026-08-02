# proxy-control — Plan de implementación (HANDOFF)

Guía paso a paso para implementar **proxy-control** de principio a fin. Pensada para
ejecutarse en orden. Cada fase indica archivos a crear, comandos y criterios de "hecho".

> Especificación funcional y de arquitectura: ver `AGENTS.md` (= `CLAUDE.md`).
> Regla de trabajo vigente: **no hacer commits** (los hace el usuario) y **diseñar la UI
> con ux-engine antes de implementarla** (Fase 7).

---

## 0. Decisiones aplicadas

| Tema              | Decisión                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| DB                | Postgres compartido (`dbshared` vía **pgbouncer**), esquema `proxy_control`, **Drizzle** ORM + migraciones |
| Cloudflare        | Registro DNS **A/CNAME (proxied)** vía **API token**                     |
| Mikrotik          | **REST API RouterOS 7** sobre **www-ssl (443)** → `/rest/ip/dns/static`  |
| Público/privado   | **Metadato en DB** (elegido al crear; preexistentes = `unclassified`)    |
| Reconciliación    | **Bajo demanda** (botón), por dominio o flota completa                   |
| Auth              | Login de un usuario (env + cookie sesión), `AUTH_ENABLED` togglable      |
| Observabilidad    | `prom-client` en `/metrics` + logs JSON a stdout; stack en `infra/observability/` |

---

## 1. Prerrequisitos — datos y accesos a reunir ANTES de codear

Reunir estos valores (irán a `.env` por entorno, nunca commiteados):

**Postgres (dbshared + pgbouncer)**
- [ ] Host y puerto de pgbouncer (p. ej. `pgbouncer:6432`)
- [ ] Usuario / password con permiso para crear el esquema `proxy_control`
- [ ] Nombre de la base (`dbshared`)
- [ ] Confirmar **pool mode = transaction** en pgbouncer (afecta a prepared statements)

**Nginx Proxy Manager**
- [ ] `NPM_BASE_URL` (p. ej. `http://npm.lan:81`)
- [ ] Email + password de un usuario NPM (para obtener token vía `POST /api/tokens`)

**Cloudflare**
- [ ] `CLOUDFLARE_API_TOKEN` con permiso **Zone.DNS: Edit** sobre la zona
- [ ] `CLOUDFLARE_ZONE_ID` de la zona del dominio público
- [ ] IP pública / target al que apuntarán los registros (A) o hostname (CNAME)

**Mikrotik RB750Gr3 (RouterOS 7.23.2)**
- [ ] `MIKROTIK_BASE_URL` = `https://192.168.88.1` (www-ssl, 443)
- [ ] Usuario API dedicado (grupo con permiso `rest-api`, `read`, `write`) + password
- [ ] Confirmar servicio **www-ssl** activo (`/ip/service`) y certificado asignado
- [ ] Decidir manejo de certificado self-signed: importar CA o `MIKROTIK_TLS_INSECURE=true`
- [ ] IP interna de NPM a la que apuntarán las entradas DNS estáticas privadas

**Auth**
- [ ] `AUTH_ENABLED` (true/false), `AUTH_USER`, `AUTH_PASSWORD_HASH`, `SESSION_SECRET`

---

## 2. Bootstrap del proyecto

El repo ya tiene Astro 7 + Preact + Tailwind 4 (`astro.config.mjs`, `package.json`).
Completar la base:

```bash
# Dependencias runtime (INSTALADAS)
npm i drizzle-orm pg prom-client zod @node-rs/argon2
npm i -D drizzle-kit @types/pg tsx
```

- [x] Verificar `astro.config.mjs`: `output: 'server'`, adaptador `@astrojs/node`
  standalone, integración Preact (`jsxImportSource: 'preact'` en tsconfig), `@tailwindcss/vite`. ✅ ya correcto
- [x] `.prettierrc` con: 4 espacios, sin `;`, comillas simples, `trailingComma: all`,
  `printWidth: 120`, plugins `prettier-plugin-astro` + `prettier-plugin-tailwindcss`. ✅ ya correcto
- [x] `.env.example` en la raíz con todas las variables (dev = Postgres directo; prod = pgbouncer).
- [x] `.gitignore`: `.env`, `.env.*` (excepto `*.env.example`). Añadido `.dockerignore`.
- [x] Scripts en `package.json`: `db:generate`, `db:migrate`, `db:studio`,
  `docker:dev`, `docker:prod` (además de `dev/build/preview/format`).
- [x] `npm run build` y `npm run format` verdes tras el bootstrap.

> **Nota**: `zod` para validar env (Fase 3) y `@node-rs/argon2` para el hash de auth
> (Fase 8) — ambos con prebuilts para win32-x64 (dev) y linux-{x64,arm64}-musl (Alpine/Pi).
> La estructura de carpetas de abajo se crea a medida que cada fase añade sus ficheros
> (no se crean directorios vacíos).

**Estructura de carpetas objetivo**

```
src/
  pages/
    index.astro                 # tabla de dominios (isla Preact)
    login.astro                 # si AUTH_ENABLED
    health.ts                   # GET /health
    metrics.ts                  # GET /metrics
    api/
      domains/index.ts          # GET, POST
      domains/[id].ts           # PATCH, DELETE
      domains/[id]/reconcile.ts # POST
      domains/[id]/status.ts    # GET
      reconcile.ts              # POST (flota)
      status.ts                 # GET (flota, polling)
      auth/login.ts, auth/logout.ts
  middleware.ts                 # guard de auth
  server/
    config/env.ts               # lectura + validación de env (zod opcional)
    db/
      client.ts                 # pool pg + drizzle
      schema.ts                 # tabla domains
      migrate.ts
    providers/
      npm.ts
      cloudflare.ts
      mikrotik.ts
    domain/
      create-domain.ts          # orquesta CF/Mikrotik → NPM → DB
      reconcile-domain.ts       # compara deseado vs real y repara
      list-domains.ts           # cruza NPM + DB
    reconcile/
      diff.ts                   # cálculo de estado (synced/drift/missing)
    http/
      error-response.ts         # mapeo de errores → HTTP
    errors/                     # una clase por archivo + index.ts (barrel)
      validation-error.ts
      not-found-error.ts
      provider-error.ts
      index.ts
    validation/
      hostname.ts, ip.ts, domain.ts
    observability/
      metrics.ts                # registro prom-client + contadores
      logger.ts                 # log JSON a stdout
    auth/
      session.ts, password.ts
  components/                   # islas Preact + subcomponentes
  hooks/                        # useDomains, useReconcile, etc.
  lib/
    domain-status.ts            # metadata de presentación (colores/labels)
  styles/global.css             # @theme Tailwind (tokens neón)
drizzle/                        # migraciones generadas
infra/                          # Fase 9
```

---

## 3. Capa de datos (Postgres + Drizzle) — ✅ HECHO

- [x] `src/server/config/env.ts`: valida env con **zod** (fallo rápido con detalle).
  `AUTH_USER`/`AUTH_PASSWORD_HASH` requeridos solo si `AUTH_ENABLED`. Las herramientas
  de DB NO usan este módulo (leen solo la URL de Postgres de `process.env`).
- [x] Tipos compartidos front/back en `src/lib/domain-types.ts` (`NpmOptions`,
  `CustomLocation`, uniones, `DEFAULT_NPM_OPTIONS`).
- [x] `src/server/db/schema.ts`: tabla `domains` en esquema `proxy_control`:
  `id (uuid, pk, default gen_random_uuid())`, `hostname (text, unique)`,
  `visibility (enum: public|private|unclassified)`,
  `forward_scheme (enum: http|https, default 'http')`, `forward_host (text)`,
  `forward_port (int)`,
  `npm_options (jsonb)` = `{ block_exploits, websockets, cache_assets, http2, hsts, force_ssl }`,
  `custom_locations (jsonb, default '[]')`,
  `ssl_mode (enum: new|wildcard)`, `certificate_id (int null)`,
  `cf_record_type (enum: A|CNAME, default 'A')`, `cf_content (text null)`,
  `cf_proxied (bool, default true)`,
  `npm_proxy_id (int null)`, `cloudflare_record_id (text null)`,
  `mikrotik_dns_id (text null)`,
  `reconcile_state (enum: synced|drift|missing|error, default 'missing')`,
  `last_reconciled_at (timestamptz null)`, `created_at`, `updated_at`.
- Defaults de `npm_options`: todo `true` (block_exploits, websockets, cache_assets,
  http2, hsts, force_ssl). `ssl_mode`: `new` si public, `wildcard` si private.
- [x] `drizzle.config.ts` → `schema.ts`, `out: './drizzle'`, `schemaFilter: ['proxy_control']`.
  Carga `.env` con `process.loadEnvFile()`; usa `MIGRATION_DATABASE_URL ?? DATABASE_URL`.
- [x] `src/server/db/client.ts`: `pg.Pool` + `drizzle()`. **pgbouncer transaction mode**:
  node-postgres no usa prepared statements con nombre → compatible; además Drizzle
  cualifica por esquema (`proxy_control.*`), así que no dependemos del `search_path`.
- [x] `src/server/db/migrate.ts`: runner con `drizzle-orm/node-postgres/migrator`; en prod
  usa la conexión DIRECTA (`MIGRATION_DATABASE_URL`), no el pooler.
- [x] Migración inicial generada (`drizzle/0000_*.sql`): `CREATE SCHEMA "proxy_control"`
  + 5 enums + tabla `domains` (20 columnas, `UNIQUE(hostname)`, defaults). Verificado.
- [x] TypeScript añadido (devDep) + script `typecheck`; `tsc --noEmit` limpio, `build` verde.
- [ ] **Pendiente de DB real**: aplicar con `npm run db:migrate` y smoke `SELECT 1` /
  insert round-trip cuando haya un Postgres accesible (dev compose, Fase 9).

---

## 4. Providers (clientes de integración) — ✅ HECHO

Cada uno es un módulo aislado sin lógica de negocio. Todos lanzan `ProviderError`
en fallo (mapeado a HTTP 502).

- [x] Clases de error en `src/server/errors/` (una por archivo + barrel `index.ts`):
  `ValidationError` (400, `fields`), `NotFoundError` (404), `ProviderError` (502,
  `provider` + `status`).
- [x] Helper `providers/http.ts`: `fetchJson()` (usado por NPM y Cloudflare) que
  convierte fallos de red / respuestas no-2xx en `ProviderError`.

### 4.1 `providers/npm.ts` — [x]
- [x] `getToken()` → `POST {NPM_BASE_URL}/api/tokens` con `{ identity, secret }`;
  token cacheado (renovado 60s antes de expirar).
- [x] `listProxyHosts()` → `GET /api/nginx/proxy-hosts` (Bearer).
- [x] `listCertificates()` → `GET /api/nginx/certificates` (para casar el wildcard).
- [x] `createProxyHost(input)` → `POST /api/nginx/proxy-hosts`. Mapeo exacto de opciones:
  ```jsonc
  {
    "domain_names": ["app.negri.es"],
    "forward_scheme": "http",
    "forward_host": "192.168.1.50",
    "forward_port": 8080,
    "block_exploits": true,          // Block Common Exploits
    "allow_websocket_upgrade": true, // Websockets Support
    "caching_enabled": true,         // Cache Assets
    "http2_support": true,           // HTTP/2 Support
    "hsts_enabled": true,            // HSTS Enabled
    "ssl_forced": true,              // Force SSL
    "locations": [],                 // Custom Locations
    // SSL:
    //  public  → "certificate_id": "new" + meta.dns_challenge: false
    //            (flujo estándar de NPM de "solicitar cert nuevo" con Let's Encrypt)
    //  private → "certificate_id": <id del wildcard *.negri.es> (listCertificates),
    //            sin meta de emisión (se reutiliza el cert existente)
    "certificate_id": "new",
    "meta": { "letsencrypt_agree": true, "dns_challenge": false }
  }
  ```
  > SSL — **Público**: `certificate_id: "new"` con `dns_challenge: false`, es decir el
  > comportamiento por defecto de NPM al pedir un cert nuevo con Let's Encrypt.
  > **Privado**: **DNS-01**, reutiliza el cert wildcard `*.negri.es` ya presente (no emite).
  >
  > Implementado: `certificate_id: 'new'` → `meta.letsencrypt_agree: true` y
  > `dns_challenge` según input; con id numérico (wildcard) no se piden metadatos de emisión.
- [x] `deleteProxyHost(id)` → `DELETE /api/nginx/proxy-hosts/:id`.
- Ref: https://nginxproxymanager.com/api/

### 4.2 `providers/cloudflare.ts` — [x]
- [x] `findRecord(name)` → `GET /zones/{ZONE}/dns_records?name={name}` (primer match o null).
- [x] `createRecord({ name, content, type, proxied })` →
  `POST /zones/{ZONE}/dns_records` con `{ type, name, content, proxied, ttl: 1 }`.
- [x] `deleteRecord(id)` → `DELETE /zones/{ZONE}/dns_records/{id}`.
- [x] Auth `Bearer {CLOUDFLARE_API_TOKEN}`; valida el envelope `success/errors/result`.
- Ref: https://developers.cloudflare.com/api/

### 4.3 `providers/mikrotik.ts` (REST v7 sobre www-ssl 443) — [x]
- [x] Cliente `node:https` con **Basic auth** y `Agent({ rejectUnauthorized:
  !MIKROTIK_TLS_INSECURE })` (para el cert self-signed).
- [x] `listStaticDns()` → `GET {BASE}/rest/ip/dns/static`.
- [x] `createStaticDns({ name, address })` → `PUT {BASE}/rest/ip/dns/static`
  con `{ name, address, type: 'A' }`.
- [x] `deleteStaticDns(id)` → `DELETE {BASE}/rest/ip/dns/static/{id}` (id `.id` url-encoded).
- Ref: https://help.mikrotik.com/docs/display/ROS/REST+API
- **Fallback documentado**: si www-ssl no fuese viable, usar api-ssl (8729) con una
  librería de la API binaria; encapsular igualmente tras la misma interfaz del módulo.

- [x] `tsc --noEmit` limpio con los 3 providers + helper + errores.
- [ ] **Pendiente de humo real**: listar recursos (proxy hosts, DNS records, static DNS)
  contra NPM/CF/Mikrotik reales sin errores de auth/TLS (cuando haya credenciales).

---

## 5. Lógica de dominio y reconciliación — ✅ HECHO

> **Decisión de diseño (cambio vs plan original)**: en vez de "external-first con
> rollback", se implementa **estado-deseado-primero**: `createDomain` inserta la fila
> deseada y delega en `reconcileDomain`, que crea los recursos en orden **DNS → NPM**.
> Ventajas: reutiliza la reconciliación para el alta, respeta "CF/Mikrotik **antes** que
> NPM", y ante fallo la fila queda en `error` (reintentable con el botón) sin rollback
> frágil. Helpers compartidos en `domain/desired.ts` evitan duplicar el mapeo.

### 5.1 Alta de dominio — `domain/create-domain.ts` — [x]
- [x] Inserta la fila deseada (`npm_options` = `DEFAULT_NPM_OPTIONS`, `ssl_mode` `new`/
  `wildcard`, `cf_*` para público) con `reconcile_state: 'missing'`, luego `reconcileDomain`.
- [x] Validación mínima: público con registro **A** exige `cfContent`/`PUBLIC_IP`.
- [x] Colisión de `hostname` (unique 23505) → `ValidationError`.
- [x] Si la reconciliación falla, la fila queda en `error` y se devuelve igualmente.

### 5.2 Reconciliación — `reconcile/diff.ts` + `domain/reconcile-domain.ts` — [x]
- [x] `diff(domain)`: lee NPM + (CF o Mikrotik) y deriva `synced`/`drift`/`missing`/`error`.
  El `drift` cubre `forward_*`, las 6 opciones de `npm_options`, ausencia de cert SSL, y
  el registro CF (`type`/`content`/`proxied`) o la entrada Mikrotik (`address`).
- [x] `reconcileDomain(id)`: asegura DNS (CF/Mikrotik) **y luego** NPM; crea lo que falta y
  repara el drift (`updateRecord`/`updateStaticDns`/`updateProxyHost`); persiste ids +
  `reconcile_state` + `last_reconciled_at`. Deja `error` si algo falla. Rechaza `unclassified`.
- [x] `reconcileAll()`: itera la flota (secuencial), salta `unclassified`, devuelve resumen.
- [x] CRUD de providers completado con `updateProxyHost`/`updateRecord`/`updateStaticDns`.

### 5.3 Listado — `domain/list-domains.ts` — [x]
- [x] Cruza `listProxyHosts()` con la DB por `hostname`; hosts de NPM sin fila →
  `visibility: 'unclassified'`. Incluye `enabledInNpm` y `npmProxyId`.

- [x] `tsc --noEmit` limpio y `prettier` conforme en toda la Fase 5.

---

## 6. Endpoints API (SSR) — ✅ HECHO

En `src/pages/api/**`, JSON, con `http/error-response.ts` (`json`, `readJson`,
`requireParam`, y `route()` que envuelve cada handler y mapea
`ValidationError → 400` (+`fields`), `NotFoundError → 404`, `ProviderError → 502`
(+`provider`), resto → 500). Validación de payloads con **zod** en `validation/`
(`hostname.ts`, `ip.ts`, `domain.ts` → `parseCreateDomainInput`/`parseUpdateDomainInput`).

- [x] `GET /api/domains` → `listDomains()`
- [x] `POST /api/domains` → `parseCreateDomainInput` → `createDomain()` (201)
- [x] `PATCH /api/domains/:id` → `parseUpdateDomainInput` → `updateDomain()`
- [x] `DELETE /api/domains/:id?removeDns=true` → `deleteDomain()`
- [x] `POST /api/domains/:id/reconcile` → `reconcileDomain(id)`
- [x] `GET /api/domains/:id/status` → `diff(domain)` (chequeo en vivo, on-demand)
- [x] `POST /api/reconcile` → `reconcileAll()`
- [x] `GET /api/status` → `listStatus()` (SOLO DB, barato para el polling)
- [x] Servicios de soporte: `update-domain.ts`, `delete-domain.ts`, `list-status.ts`.
- [x] `tsc` limpio y **`astro build` verde** (confirma que la validación de env corre en
  runtime, no en build).
- [ ] `GET /health` y `GET /metrics` → Fase 8.
- CSRF: el front llama con `fetch` mismo-origen y `content-type: application/json`.

> **Nota de diseño**: `/api/status` (polling) devuelve el estado **almacenado** en DB
> (rápido); el chequeo en vivo contra proveedores es `/api/domains/:id/status` y la
> reconciliación (botón). Coherente con "reconciliación bajo demanda".

---

## 7. Front (UI) — **diseñar antes de implementar**

1. [ ] **ux-engine `ux-design`**: wireframe + spec de la tabla de dominios y del modal de
   alta, cubriendo TODOS los estados: loading, vacío, error, `synced/drift/missing`,
   `unclassified`, y el flujo de reconciliar (idle → reconciliando → resultado).
2. [ ] `styles/global.css`: tokens `@theme` (colores neón por estado, radios, glow).
3. [ ] Componentes atómicos en `src/components/` (tabla, fila, badges de proveedor,
   botones de acción, modal de alta). Lógica de estado extraída a **hooks** en
   `src/hooks/` (`useDomains`, `useReconcile`, `useCreateDomain`).
4. [ ] `src/lib/domain-status.ts`: mapeo estado → label/color/icono (sin lógica).
5. [ ] Polling de `/api/status` para refrescar badges (solo lectura).
6. [ ] **ux-engine `ux-review`** sobre el diff antes de dar por cerrada la UI.

---

## 8. Observabilidad, health y auth

- [ ] `observability/metrics.ts`: registro `prom-client` con métricas de negocio
  (dominios por estado, reconciliaciones, errores por proveedor, latencia de llamadas).
  Exponer en `GET /metrics`.
- [ ] `observability/logger.ts`: logs JSON estructurados a stdout (nivel, msg, contexto).
- [ ] `GET /health`: readiness de DB (`SELECT 1`) y ping ligero a proveedores (con cache).
- [ ] `middleware.ts` + `auth/`: si `AUTH_ENABLED`, exigir cookie de sesión válida;
  `login.astro` + `POST /api/auth/login` (verifica `AUTH_USER`/`AUTH_PASSWORD_HASH`),
  `POST /api/auth/logout`. Excluir `/health` y `/metrics` del guard.

---

## 9. Infra / Docker

Dos entornos de primera clase: **dev** (todo autocontenido en local) y **prod**
(integrado con el core de `pi-infra`). Sigue el patrón de `apps/wake-lan-app` (sin
subnivel `prod` en pi-infra) y la observabilidad por-app de `powerlog`.

**Layout del repo** (fuente de verdad):

```
infra/
  Dockerfile                 # ✅ HECHO — multi-stage Node 24 (base→deps→build→prod-deps→runtime + dev)
  dev/
    compose.yml              # stack local COMPLETO (ver 9.1)
    .env.example
  prod/
    compose.yml              # app + su prometheus/loki/alloy (ver 9.2); monta ./observability
    proxy-control.env.example
    scrape.d/                # targets de scrape extra por-entorno (opcional)
  observability/             # ÚNICA fuente de configs obs (la monta prod; el sync la sube)
    prometheus/prometheus.yml
    prometheus/rules/proxy-control-alerts.yml
    loki/loki-config.yaml
    alloy/config.alloy
    alertmanager/alertmanager.yml           # opcional (Discord propio)
    grafana/
      provisioning/datasources/datasources.yaml   # apunta la Grafana del core a proxy-control-{prometheus,loki}
      provisioning/dashboards/dashboards.yaml
      dashboards/*.json
scripts/sync-pi-infra.sh     # ✅ HECHO — contrato de sync a pi-infra (ver 9.3)
.github/workflows/sync-pi-infra.yml   # abre PR a pi-infra y auto-merge (ver 9.3)
.github/workflows/docker-publish.yml  # build+push de la imagen (negrii/proxy-control:latest)
```

### 9.1 Dev — stack completo sin pgbouncer
`infra/dev/compose.yml` **autocontenido**, redes propias (no toca el core):
- [ ] `proxy-control` (target `dev` del Dockerfile, hot reload por volumen), `PORT 4321`.
- [ ] `postgres:16-alpine` **directo, SIN pgbouncer** (no necesario en dev). La app
  apunta `DATABASE_URL` a `postgres:5432` con `search_path=proxy_control`.
- [ ] Observabilidad local COMPLETA: `grafana` (:3000), `prometheus`, `loki`, `alloy`
  (lee `/var/run/docker.sock` para logs). Grafana con provisioning apuntando al
  prometheus/loki locales para probar dashboards antes de subirlos.
- [ ] Migraciones al arranque (entrypoint o job `db:migrate`).

### 9.2 Prod — app + obs propia, DB/pgbouncer/Grafana del core
`infra/prod/compose.yml`: **NO despliega** postgres, pgbouncer ni grafana (los pone el
core). Servicios prefijados `proxy-control-`:
- [ ] `proxy-control` (imagen `negrii/proxy-control:latest`, `pull_policy: always`,
  label watchtower). Runtime → **`pgbouncer:6432`**; migraciones → **`postgres:5432`**
  directo (bypass del pooler). Se expone por el **NPM del core** (no publica puertos).
- [ ] `proxy-control-prometheus`, `proxy-control-loki`, `proxy-control-alloy` montando
  `./observability/...` (tras el sync; en el repo es `../observability`, ver 9.3).
- [ ] (Opcional) `proxy-control-alertmanager` con su propio webhook de Discord.
- [ ] Redes **externas** del core: `db` (postgres/pgbouncer) y `monitoring` (para que la
  Grafana del core consulte `proxy-control-prometheus`/`-loki` como datasources).
  Ambas las crea `pi-infra/scripts/create-network.sh` — solo se **unen**, no se crean.
- [ ] Secretos en `proxy-control.env` **solo en la Pi** (gitignored; `*.env.example` sí
  se versiona). Provisión del rol+DB en el Postgres del core vía
  `apps/proxy-control/postgres/provision.env` (patrón del core).

### 9.3 Sync a pi-infra (por PR) — sin subnivel prod
- [x] `scripts/sync-pi-infra.sh` adaptado a `proxy-control` (contrato):
  - `infra/prod/` (menos `observability/`) → `apps/proxy-control/` (**sin `/prod`**).
  - Reescribe en el compos aterrizado `../observability` → `./observability`.
  - `infra/observability/` (menos `grafana/`) → `apps/proxy-control/observability/`.
  - dashboards `*.json` (menos `postgresql-9628.json`) → `core/grafana/dashboards/proxy-control/`.
  - datasources → `core/grafana/provisioning/datasources/proxy-control.yml`.
  - Cablea el include raíz `- apps/proxy-control/compose.yml` (idempotente).
- [ ] `.github/workflows/sync-pi-infra.yml`: en push a `main` que toque `infra/**` o el
  script, checkout de proxy-control + pi-infra (`Negri234279/pi-infra` con
  `PI_INFRA_SYNC_TOKEN`), ejecuta el script, abre PR (`create-pull-request`) y auto-merge.
  Branch `sync/proxy-control-infra`. (Modelar sobre el workflow de powerlog.)

- [ ] Scripts `docker:dev` / `docker:prod` en `package.json`
  (`docker compose -f infra/dev/compose.yml ...` / `-f infra/prod/compose.yml ...`).
  Prod normalmente se levanta desde el ROOT compose de pi-infra tras el sync.

---

## 10. Matriz de variables de entorno

| Variable                | dev | prod | Notas                                                        |
| ----------------------- | --- | ---- | ------------------------------------------------------------ |
| `DATABASE_URL` (runtime)| ✓   | ✓    | **dev**: `postgres:5432` directo. **prod**: `pgbouncer:6432`. Ambos `search_path=proxy_control` |
| `MIGRATION_DATABASE_URL`| –   | ✓    | prod: `postgres:5432` directo (bypass del pooler para migrar)|
| `NPM_BASE_URL`          | ✓   | ✓    |                                                              |
| `NPM_EMAIL/PASSWORD`    | ✓   | ✓    | para `POST /api/tokens`                                      |
| `CLOUDFLARE_API_TOKEN`  | ✓   | ✓    | Zone.DNS: Edit                                               |
| `CLOUDFLARE_ZONE_ID`    | ✓   | ✓    |                                                              |
| `MIKROTIK_BASE_URL`     | ✓   | ✓    | `https://192.168.88.1` (443)                                 |
| `MIKROTIK_USER/PASSWORD`| ✓   | ✓    | usuario con `rest-api`                                       |
| `MIKROTIK_TLS_INSECURE` | ✓   | ?    | si cert self-signed                                          |
| `NPM_INTERNAL_IP`       | ✓   | ✓    | target de DNS estático privado                               |
| `AUTH_ENABLED`          | ✓   | ✓    | false solo-LAN                                               |
| `AUTH_USER / *_HASH`    | ✓   | ✓    |                                                              |
| `SESSION_SECRET`        | ✓   | ✓    |                                                              |
| `HOST / PORT`           | ✓   | ✓    | PORT 4321                                                    |

> Nota dev: al no haber pgbouncer, el runtime puede usar prepared statements sin
> problema. En prod, con pgbouncer en `transaction` mode, evitarlos (ver Fase 3).

---

## 11. Verificación / criterios de aceptación

- [ ] `npm run db:migrate` crea esquema + tabla en Postgres.
- [ ] Los 3 providers listan recursos reales (humo) sin errores de auth/TLS.
- [ ] Alta de dominio **público** crea CF → NPM → DB en ese orden; rollback si falla.
- [ ] Alta de dominio **privado** crea Mikrotik → NPM → DB; rollback si falla.
- [ ] La tabla muestra estado por proveedor (synced/drift/missing/unclassified).
- [ ] El botón "Reconciliar" (por dominio y flota) repara y actualiza estado.
- [ ] `/health` OK, `/metrics` expone métricas, logs en JSON.
- [ ] `docker compose` levanta dev/staging/prod; stack de observabilidad scrapea la app.
- [ ] `npx prettier --write` aplicado; sin issues de ux-review pendientes.

---

## 12. Orden de ejecución resumido

1. Fase 1 (reunir accesos) → 2 (bootstrap) → 3 (DB) → 4 (providers) → 5 (dominio/reconcile)
   → 6 (API) → 7 (UI, con ux-engine) → 8 (observabilidad/auth) → 9 (infra/docker).
2. Validar con Fase 11 tras cada bloque; formatear con Prettier al cerrar cada cambio.
3. **No commitear**: el usuario revisa y commitea manualmente.
