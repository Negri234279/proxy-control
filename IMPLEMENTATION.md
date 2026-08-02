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
# Dependencias runtime
npm i drizzle-orm pg prom-client
npm i -D drizzle-kit @types/pg tsx

# (Auth) hashing de password
npm i @node-rs/argon2   # o bcrypt si se prefiere
```

- [ ] Verificar `astro.config.mjs`: `output: 'server'`, adaptador `@astrojs/node`
  standalone, integración Preact (`jsxImportSource: 'preact'`), `@tailwindcss/vite`.
- [ ] `.prettierrc` con: 4 espacios, sin `;`, comillas simples, `trailingComma: all`,
  `printWidth: 120`, plugins `prettier-plugin-astro` + `prettier-plugin-tailwindcss`.
- [ ] `.env.example` en la raíz con todas las variables de la Fase 1 (sin valores).
- [ ] `.gitignore`: `.env`, `.env.*` (excepto `.env.example`), `dist/`, `node_modules/`.
- [ ] Scripts en `package.json`: `dev`, `build`, `preview`, `db:generate`, `db:migrate`,
  `format`, `docker:dev`, `docker:staging`, `docker:prod`.

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

## 3. Capa de datos (Postgres + Drizzle)

- [ ] `src/server/config/env.ts`: leer y validar env (fallar rápido si falta algo).
- [ ] `src/server/db/schema.ts`: tabla `domains` en esquema `proxy_control`:
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
- [ ] `drizzle.config.ts` apuntando a `schema.ts`, `out: './drizzle'`, `schema: 'proxy_control'`.
- [ ] `src/server/db/client.ts`: `pg.Pool` + `drizzle()`. **Importante pgbouncer
  transaction mode**: usar `pg` con statements no-prepared o pasar
  `?options=-c%20search_path%3Dproxy_control`; evitar prepared statements persistentes.
- [ ] Migración inicial: `CREATE SCHEMA IF NOT EXISTS proxy_control;` + tabla.
  Generar con `npm run db:generate` y aplicar con `npm run db:migrate`.
- [ ] **Hecho** cuando: `db:migrate` crea el esquema y la tabla, y un script de humo
  hace `SELECT 1` y un insert/round-trip.

---

## 4. Providers (clientes de integración)

Cada uno es un módulo aislado sin lógica de negocio. Todos lanzan `ProviderError`
en fallo (mapeado a HTTP 502).

### 4.1 `providers/npm.ts`
- [ ] `getToken()` → `POST {NPM_BASE_URL}/api/tokens` con `{ identity, secret }`;
  cachear el token con su expiración.
- [ ] `listProxyHosts()` → `GET /api/nginx/proxy-hosts` (Bearer). Devuelve
  `{ id, domain_names[], forward_scheme, forward_host, forward_port, enabled, ... }`.
- [ ] `listCertificates()` → `GET /api/nginx/certificates`. Se usa para localizar el
  **cert wildcard** (`nice_name`/`domain_names` que casen con `*.negri.es` / `negri.es`)
  en altas privadas.
- [ ] `createProxyHost(payload)` → `POST /api/nginx/proxy-hosts`. Construir el body con
  el mapeo exacto de opciones:
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
- [ ] `deleteProxyHost(id)` → `DELETE /api/nginx/proxy-hosts/:id`.
- Ref: https://nginxproxymanager.com/api/

### 4.2 `providers/cloudflare.ts`
- [ ] `findRecord(name)` → `GET /client/v4/zones/{ZONE}/dns_records?name={name}`.
- [ ] `createRecord({ name, content, type, proxied })` →
  `POST /client/v4/zones/{ZONE}/dns_records` con `{ type, name, content, proxied: true, ttl: 1 }`.
- [ ] `deleteRecord(id)` → `DELETE /client/v4/zones/{ZONE}/dns_records/{id}`.
- Auth: header `Authorization: Bearer {CLOUDFLARE_API_TOKEN}`.
- Ref: https://developers.cloudflare.com/api/

### 4.3 `providers/mikrotik.ts` (REST v7 sobre www-ssl 443)
- [ ] Cliente HTTPS con **Basic auth** (`MIKROTIK_USER:MIKROTIK_PASSWORD`).
  Si cert self-signed: `Agent({ rejectUnauthorized: !MIKROTIK_TLS_INSECURE })`.
- [ ] `listStaticDns()` → `GET {BASE}/rest/ip/dns/static`.
- [ ] `createStaticDns({ name, address })` → `PUT {BASE}/rest/ip/dns/static`
  con `{ name, address, type: 'A' }` (name = hostname, address = IP interna de NPM).
- [ ] `deleteStaticDns(id)` → `DELETE {BASE}/rest/ip/dns/static/{id}`.
- Ref: https://help.mikrotik.com/docs/display/ROS/REST+API
- **Fallback documentado**: si www-ssl no fuese viable, usar api-ssl (8729) con una
  librería de la API binaria; encapsular igualmente tras la misma interfaz del módulo.

- [ ] **Hecho** cuando: un script de humo por proveedor lista recursos reales
  (proxy hosts, DNS records, static DNS) sin errores de auth/TLS.

---

## 5. Lógica de dominio y reconciliación

### 5.1 Alta de dominio — `domain/create-domain.ts`
Orquesta según `visibility`, con orden estricto y rollback en fallo:

- **public**:
  1. `cloudflare.createRecord()` — tipo `cf_record_type` (default **A** → IP pública),
     `proxied = cf_proxied` (default **true**), TTL 1.
  2. `npm.createProxyHost({ ...defaults, certificate_id: 'new', meta.dns_challenge: false })`
     — **flujo estándar de NPM de "solicitar cert nuevo" con Let's Encrypt**.
  3. `db.insert()`.
  > SSL público: comportamiento por defecto de NPM (`dns_challenge: false`). El registro
  > CF puede quedar *proxied* (naranja); NPM gestiona la validación como lo hace de forma
  > normal. DNS-01 NO se usa en público (queda reservado al wildcard privado).
- **private**:
  1. `mikrotik.createStaticDns({ name: hostname, address: NPM_INTERNAL_IP })`.
  2. Resolver el cert wildcard (**DNS-01**): `npm.listCertificates()` → casar
     `*.negri.es`/`negri.es` → `createProxyHost({ ...defaults, certificate_id: <idWildcard> })`
     (**no** emite nuevo).
  3. `db.insert()`.
- [ ] Defaults de `npm_options` aplicados en ambos: `block_exploits`, `websockets`,
  `cache_assets`, `http2`, `hsts`, `force_ssl` = `true`; `locations = []`.
- [ ] Si falla un paso posterior, revertir el/los anteriores (borrar record/proxy) o,
  si no es posible, persistir `reconcile_state: 'error'` para reparar luego.

### 5.2 Reconciliación — `reconcile/diff.ts` + `domain/reconcile-domain.ts`
- [ ] `diff(domain)`: consulta NPM + (CF o Mikrotik según tipo) y calcula estado:
  `synced` (todo existe y coincide), `drift` (existe pero difiere),
  `missing` (falta en algún proveedor), `error` (fallo al consultar).
  El `drift` incluye divergencias en: `forward_*`, opciones de `npm_options`
  (block_exploits, websockets, cache_assets, http2, hsts, force_ssl), certificado SSL
  (público con cert / privado con wildcard), y en el registro CF (`record_type`,
  `content`, `proxied`) o la entrada DNS del Mikrotik (`address`).
- [ ] `reconcileDomain(id)`: recalcula diff y **crea/repara lo que falte**; actualiza
  `reconcile_state` y `last_reconciled_at`.
- [ ] `reconcileAll()`: itera la flota (secuencial o con límite de concurrencia).

### 5.3 Listado — `domain/list-domains.ts`
- [ ] Cruza `npm.listProxyHosts()` con `db.select()` por `hostname`. Los hosts de NPM
  sin fila en DB se devuelven como `visibility: 'unclassified'`.

---

## 6. Endpoints API (SSR)

Implementar en `src/pages/api/**` devolviendo JSON, usando `error-response.ts` para
mapear `ValidationError → 400`, `NotFoundError → 404`, `ProviderError → 502`, resto → 500.

- [ ] `GET /api/domains` → `listDomains()`
- [ ] `POST /api/domains` → valida (`validation/*`) → `createDomain()`
- [ ] `PATCH /api/domains/:id` / `DELETE /api/domains/:id`
- [ ] `POST /api/domains/:id/reconcile` → `reconcileDomain(id)`
- [ ] `GET /api/domains/:id/status` → `diff(domain)`
- [ ] `POST /api/reconcile` → `reconcileAll()`
- [ ] `GET /api/status` → estado resumido de la flota (para polling de la tabla)
- [ ] `GET /health` (Fase 8) y `GET /metrics` (Fase 8)
- CSRF: el front llama con `fetch` mismo-origen y `content-type: application/json`.

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

Crear `infra/` en la raíz:

```
infra/
  Dockerfile
  dev/      docker-compose.yml   .env.example
  staging/  docker-compose.yml   .env.example
  prod/     docker-compose.yml   .env.example
  observability/
    docker-compose.yml
    prometheus/prometheus.yml
    alloy/config.alloy
    alertmanager/alertmanager.yml
    grafana/ (provisioning + dashboards)
```

- [ ] `infra/Dockerfile` **multi-stage**: `base` (node:22-alpine) → `deps` → `build`
  (`astro build`) → `prod-deps` (`npm ci --omit=dev`) → `runtime` (copia `dist/` +
  node_modules prod, `CMD node ./dist/server/entry.mjs`) + `dev` (hot reload por volumen).
- [ ] compose por entorno: puertos **dev libre / staging 4322 / prod 4321**; inyectan
  `DATABASE_URL` y secretos por env; **red bridge** (no host — solo HTTP saliente).
  El contenedor debe alcanzar NPM, Cloudflare (internet), Mikrotik y pgbouncer.
- [ ] Ejecutar migraciones en el arranque del entorno (entrypoint) o como job aparte.
- [ ] `infra/observability/`: Prometheus scrapea `proxy-control:PORT/metrics`; Alloy
  recoge logs; Alertmanager con reglas básicas (app down, tasa de errores de reconcile);
  Grafana con datasource + dashboard inicial.
- [ ] Scripts `docker:dev|staging|prod` en `package.json` apuntando a cada compose.

---

## 10. Matriz de variables de entorno

| Variable                | dev | staging | prod | Notas                                  |
| ----------------------- | --- | ------- | ---- | -------------------------------------- |
| `DATABASE_URL`          | ✓   | ✓       | ✓    | pgbouncer, `search_path=proxy_control` |
| `NPM_BASE_URL`          | ✓   | ✓       | ✓    |                                        |
| `NPM_EMAIL/PASSWORD`    | ✓   | ✓       | ✓    | para `POST /api/tokens`                |
| `CLOUDFLARE_API_TOKEN`  | ✓   | ✓       | ✓    | Zone.DNS: Edit                         |
| `CLOUDFLARE_ZONE_ID`    | ✓   | ✓       | ✓    |                                        |
| `MIKROTIK_BASE_URL`     | ✓   | ✓       | ✓    | `https://192.168.88.1` (443)           |
| `MIKROTIK_USER/PASSWORD`| ✓   | ✓       | ✓    | usuario con `rest-api`                 |
| `MIKROTIK_TLS_INSECURE` | ✓   | ?       | ?    | si cert self-signed                    |
| `NPM_INTERNAL_IP`       | ✓   | ✓       | ✓    | target de DNS estático privado         |
| `AUTH_ENABLED`          | ✓   | ✓       | ✓    | false solo-LAN                         |
| `AUTH_USER / *_HASH`    | ✓   | ✓       | ✓    |                                        |
| `SESSION_SECRET`        | ✓   | ✓       | ✓    |                                        |
| `HOST / PORT`           | ✓   | ✓       | ✓    | 4322 staging / 4321 prod               |

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
