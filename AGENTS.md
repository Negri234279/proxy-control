# proxy-control

Panel web para **gobernar los dominios de Nginx Proxy Manager (NPM)** que corre en la
misma red, distinguiendo dominios **públicos** y **privados**, y manteniéndolos
sincronizados con los sistemas que resuelven cada tipo:

- **Público** → se registra primero en **Cloudflare** (DNS) y luego en **NPM**.
- **Privado** → se registra en el **Mikrotik RB750Gr3** (RouterOS 7.23.2, DNS estático)
  y luego en **NPM**.

La app lee los dominios de NPM, muestra en una tabla su estado y **de forma visual**
si están activos en Cloudflare (públicos) o en el Mikrotik (privados), y ofrece
acciones de **reconciliación** cuando hay divergencias.

> **Nota**: `CLAUDE.md` es un symlink a este fichero (`AGENTS.md`). Editar aquí actualiza
> ambos.

> **Decisiones** (plan detallado en `IMPLEMENTATION.md`):
>
> **Confirmadas por el usuario:**
>
> - **Mikrotik**: **REST API de RouterOS 7** sobre **www-ssl (443)** →
>   `/rest/ip/dns/static`. (Disponibles también api 8728 / api-ssl 8729 como fallback.)
> - **Reconciliación**: **solo bajo demanda** (botón). El polling de la UI es de lectura,
>   no auto-repara.
>
> **Defaults razonados (vetar antes de implementar si procede):**
>
> 1. **DB**: Postgres compartido del core (`dbshared` + **pgbouncer**), esquema propio,
>    con **Drizzle** (ORM + migraciones).
> 2. **Cloudflare**: registro DNS **A/CNAME (proxied)** vía API token. **Multizona**: el token
>    (config del proveedor en la DB, no en env) da acceso a todas las zonas; la zona se elige
>    por dominio. Ver "Proveedores DNS" y el panel de Ajustes.
> 3. **Público/privado**: **metadato en nuestra DB** (elegido al crear; los dominios
>    preexistentes en NPM quedan `sin clasificar` hasta asignarles tipo).
> 4. **Auth**: login simple de un usuario (credencial por env + cookie de sesión vía
>    middleware), desactivable con `AUTH_ENABLED=false` para uso solo-LAN.

## Reglas de trabajo (IMPORTANTE)

- **Planificar primero, actuar después.** Ante cualquier tarea no trivial, primero
  propón un plan y espera confirmación antes de escribir código.
- **Nunca hagas commit.** El usuario hace los commits manualmente. No ejecutes
  `git commit`, `git push` ni operaciones que reescriban el historial.
- Ante dudas de diseño o requisitos, **pregunta** en lugar de asumir.
- Para UI usar los recursos disponibles del entorno: plugin **ux-engine**
  (diseñar wireframe/spec antes de codear con `ux-design`, revisar con `ux-review`)
  y las skills de diseño frontend (`design-taste-frontend`, `high-end-visual-design`).
  Diseñar la UI **antes** de implementarla.

## Normas de código (clean code)

Aplican a todo el código nuevo. El formateo lo garantiza **Prettier**; estas normas
cubren estructura y estilo que Prettier no impone.

**Estructura / archivos**

- Un archivo, una responsabilidad. Extraer a archivos propios los errores, utilidades,
  constantes y cualquier cosa que no sea la función principal del archivo.
- Errores en `src/server/errors/` (una clase por archivo, barrel en `index.ts`).
- Validaciones divididas por unidad (`src/server/validation/{hostname,ip,domain}.ts`).
- Integraciones externas aisladas en `src/server/providers/{npm,cloudflare,mikrotik}.ts`
  (un cliente por proveedor, sin lógica de negocio dentro).
- Constantes/metadata de presentación del front en `src/lib/` (p. ej. `domain-status.ts`).

**Control de flujo**

- `if` en una sola línea SOLO cuando el cuerpo es un `return` (guard clause):
  `if (!value) return null`.
- Cualquier otro `if` con cuerpo, `else`, `for` y bucles: siempre en bloque multilínea
  con llaves. Nunca en una sola línea.
- Preferir guard clauses y salidas tempranas frente al anidamiento.

**Objetos**

- Objetos literales nunca en una sola línea: una propiedad por línea, con trailing comma.

**Front (Astro + Preact)**

- Componentes atómicos: una única responsabilidad y la lógica mínima en cada uno.
- Toda la lógica de estado de las islas Preact (`useState`, `useEffect`, etc.) se extrae
  a **custom hooks** (`useXxx`) para mantener el componente declarativo.

**Formateo**

- Prettier 3 con `prettier-plugin-astro` y `prettier-plugin-tailwindcss`. Config en
  `.prettierrc` (4 espacios, sin `;`, comillas simples, `trailingComma: all`, printWidth 120).
- Ejecutar `npx prettier --write` al terminar cualquier cambio.

## Stack

- **Astro 7** (`^7.1.6`) con **SSR** para toda la lógica de backend.
- **Preact 10** (`@astrojs/preact`) para los componentes interactivos (islas).
  JSX configurado con `jsxImportSource: "preact"`.
- **Tailwind CSS 4** vía `@tailwindcss/vite` (no PostCSS, no `tailwind.config`
  clásico; configuración con `@theme` en CSS).
- **Node 22+** (`engines.node >= 22.12.0`).
- Adaptador SSR: **`@astrojs/node`** en modo `standalone` (`output: 'server'` en
  `astro.config.mjs`). El acceso a NPM/Mikrotik/Cloudflare (HTTP/HTTPS) y a Postgres
  requiere que el backend corra en Node en el servidor, no en edge.
- **Persistencia: Postgres compartido** del core (`dbshared` a través de **pgbouncer**,
  pool mode `transaction`), con un **esquema propio** de proxy-control. Migraciones
  versionadas. *(Alternativa descartada por defecto: SQLite en volumen.)*
- **Observabilidad**: métricas **Prometheus** vía `prom-client` en `/metrics`, logs
  estructurados JSON a stdout recogidos por **Grafana Alloy** → **Prometheus** (y logs),
  visualización en **Grafana** y alertas por **Alertmanager**. El stack se despliega
  aparte en `infra/` (la app solo se instrumenta y expone `/metrics` + `/health`).
- **Prettier** con plugins de Astro y Tailwind para el formateo (ver "Normas de código").

## Arquitectura

```
Navegador (Preact islands)
      │  fetch()
      ▼
Endpoints SSR de Astro (src/pages/api/*.ts)   ← toda la lógica de integración vive aquí
      │
      ├─ Providers (src/server/providers/)
      │     ├─ npm.ts         → API de Nginx Proxy Manager (leer/crear proxy hosts)
      │     ├─ cloudflare.ts  → API de Cloudflare (registros DNS de dominios públicos)
      │     └─ mikrotik.ts    → REST API RouterOS 7 (/ip/dns/static, dominios privados)
      │
      ├─ Reconciliación (src/server/reconcile/)  → compara estado deseado vs real
      └─ Persistencia (src/server/db/)           → Postgres (metadata y estado deseado)
```

- Toda la lógica de red/integración **solo** se ejecuta en el servidor (SSR).
  Nunca en el cliente. Los secretos de **proveedores DNS** (token de Cloudflare, password de
  Mikrotik) se guardan **cifrados en la DB** (editables por panel); el resto de credenciales
  (NPM, DB, sesión) y la clave de cifrado `SETTINGS_KEY` viven en variables de entorno.
- Los componentes Preact son islas hidratadas que llaman a los endpoints por `fetch`.
- **Fuente de verdad**: NPM es la lista de dominios; nuestra DB guarda el *tipo*
  (público/privado), el *estado deseado* y el resultado de la última reconciliación.

## API (SSR)

Rutas en `src/pages/api/`. Todas devuelven JSON. El mapeo de errores vive en
`src/server/http/error-response.ts` (`ValidationError` → 400 con `fields`,
`NotFoundError` → 404, `ProviderError` → 502, resto → 500).

| Método | Ruta                          | Descripción                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/domains`                | Lista de dominios de NPM cruzados con metadata y estado de sync.   |
| POST   | `/api/domains`                | Crea un dominio (público: Cloudflare→NPM; privado: Mikrotik→NPM).  |
| PATCH  | `/api/domains/:id`            | Edita un dominio (tipo, upstream, flags).                          |
| DELETE | `/api/domains/:id`            | Elimina el dominio (y opcionalmente su registro DNS asociado).     |
| POST   | `/api/domains/:id/reconcile`  | Reconcilia un dominio (crea/repara lo que falte en CF o Mikrotik). |
| GET    | `/api/domains/:id/status`     | Estado de sync de un dominio (NPM + CF/Mikrotik).                  |
| POST   | `/api/reconcile`              | Reconcilia toda la flota.                                          |
| GET    | `/api/status`                 | Estado de sync de toda la flota (para el polling de la tabla).     |
| GET    | `/health`                     | Healthcheck (readiness de DB y proveedores).                       |
| GET    | `/metrics`                    | Métricas Prometheus.                                               |

> **CSRF**: Astro protege los métodos que mutan (`checkOrigin`, activo por defecto en
> SSR). El front debe llamarlos con `fetch` desde el mismo origen — el navegador envía
> el header `Origin` automáticamente. Las peticiones con `content-type: application/json`
> también lo superan.

## Modelo de datos

Persistencia en **Postgres** (esquema propio `proxy_control`). NPM es la fuente de la
lista de dominios; esta tabla guarda la clasificación y el estado deseado/observado.

```jsonc
// tabla: proxy_control.domains
{
  "id": "uuid",
  "hostname": "app.negri.es",      // subdominio / proxy host en NPM
  "visibility": "public",          // "public" | "private" | "unclassified"

  // Destino que NPM proxifica
  "forward_scheme": "http",        // "http" | "https"
  "forward_host": "192.168.1.50",  // IP/host interno del servicio
  "forward_port": 8080,

  // Opciones del proxy host de NPM (defaults al crear)
  "npm_options": {
    "block_exploits": true,        // Block Common Exploits
    "websockets": true,            // Websockets Support
    "cache_assets": true,          // Cache Assets
    "http2": true,                 // HTTP/2 Support
    "hsts": true,                  // HSTS Enabled
    "force_ssl": true              // Force SSL
  },
  "custom_locations": [],          // ubicaciones personalizadas (configurable)

  // Política SSL (según visibility)
  "ssl": {
    "mode": "new",                 // public → "new" (LE por hostname)
    //        "wildcard"           // private → cert wildcard existente (*.negri.es)
    "certificate_id": null         // id del cert en NPM una vez asignado/emitido
  },

  // Registro DNS público (solo public)
  "cloudflare": {
    "record_type": "A",            // "A" | "CNAME"
    "content": "203.0.113.10",     // IP pública (A) u host destino (CNAME)
    "proxied": true,               // naranja (proxied) vs gris (DNS-only)
    "zone_id": "abc...",           // zona de CF (multizona); null → zona por defecto del proveedor
    "zone_name": "negri.es"        // nombre de la zona (para mostrar)
  },

  // Proveedor DNS que resuelve el dominio (FK → dns_providers). Null → el habilitado del scope.
  "dns_provider_id": null,
  "npm_proxy_id": 42,              // id del proxy host en NPM (null si aún no existe)
  "cloudflare_record_id": "abc123",// id del registro DNS en CF (solo públicos)
  "mikrotik_dns_id": "*1A",        // id de la entrada /ip/dns/static (solo privados)
  "reconcile_state": "synced",     // "synced" | "drift" | "missing" | "error"
  "last_reconciled_at": "2026-08-02T10:00:00Z",
  "created_at": "2026-08-02T09:00:00Z",
  "updated_at": "2026-08-02T09:30:00Z"
}
```

> Nota: los dominios que ya existen en NPM pero no tienen fila aquí se muestran como
> `unclassified` hasta que se les asigna tipo (público/privado) desde la app.
> `npm_options`, `custom_locations` se guardan como columnas JSONB; `cf_zone_id`/`cf_zone_name`
> y el resto como columnas tipadas.

### Proveedores DNS (`proxy_control.dns_providers`)

Config de los proveedores DNS, editable desde el panel (**Ajustes → Proveedores DNS**).
Modelo **genérico** para poder añadir a futuro otros públicos o privados (p. ej. Pi-hole/AdGuard):

```jsonc
// tabla: proxy_control.dns_providers
{
  "id": "uuid",
  "kind": "cloudflare",            // "cloudflare" | "mikrotik" | … (decide el cliente)
  "scope": "public",               // "public" | "private"
  "name": "Cloudflare",
  "config": { /* no-secreto */ },  // CF: { default_public_ip, default_zone_id } · MK: { base_url, user, tls_insecure, npm_internal_ip }
  "secret": "v1:iv:tag:cipher",    // JSON CIFRADO (AES-256-GCM con SETTINGS_KEY): CF { api_token } · MK { password }
  "enabled": true
}
```

> Un dominio usa su `dns_provider_id` o, si es null, el proveedor **habilitado** de su scope.
> El seed inicial crea Cloudflare/Mikrotik desde el `.env` legacy si está presente.

## Funcionalidades

### 1. Tabla de dominios
- Lee los dominios de **NPM** y los cruza con la metadata de nuestra DB.
- Cada fila muestra: hostname, upstream, **tipo** (público/privado/sin clasificar) y,
  **de forma visual**, si está activo en **Cloudflare** (público) o en el **Mikrotik**
  (privado): estados `synced` (✔ verde/neón), `drift` (⚠ ámbar), `missing` (✖ rojo),
  `checking` (spinner).
- Acciones por fila: **reconciliar**, editar, eliminar.

### 2. Alta de dominio

Dominio base **`negri.es`** y subdominios **`*.negri.es`**. Orden estricto y rollback
en fallo; si no se puede revertir, se deja `reconcile_state: 'error'`.

**Público** (`negri.es` expuesto a internet):
1. **Cloudflare** — crea registro DNS. Por defecto **A** → IP pública, **proxied**
   (naranja), TTL auto. Configurable a **CNAME** y a **DNS-only** por dominio.
2. **NPM** — crea el proxy host con los defaults de `npm_options` (ver abajo) y
   **SSL: solicita un certificado nuevo de Let's Encrypt** para ese hostname.
3. **DB** — persiste la metadata.

**Privado** (`*.negri.es` solo resoluble en LAN):
1. **Mikrotik** — crea entrada `/ip/dns/static` (name = hostname, address = IP interna
   de NPM).
2. **NPM** — crea el proxy host con los defaults de `npm_options` y **SSL: usa el
   certificado wildcard existente** `*.negri.es` / `negri.es` (emitido por **DNS-01**).
   No solicita cert nuevo.
3. **DB** — persiste la metadata.

**Opciones del proxy host de NPM aplicadas en todas las altas** (defaults):

| Opción NPM             | Campo API NPM            | Default |
| ---------------------- | ------------------------ | ------- |
| Block Common Exploits  | `block_exploits`         | `true`  |
| Websockets Support     | `allow_websocket_upgrade`| `true`  |
| Cache Assets           | `caching_enabled`        | `true`  |
| HTTP/2 Support         | `http2_support`          | `true`  |
| HSTS Enabled           | `hsts_enabled`           | `true`  |
| Force SSL              | `ssl_forced`             | `true`  |
| Custom Locations       | `locations[]`            | `[]` (configurable) |

**Política SSL:**
- **Público** → `certificate: 'new'` en NPM: **el flujo estándar de NPM de "solicitar un
  certificado nuevo" con Let's Encrypt** (sin DNS challenge → `dns_challenge: false`).
- **Privado** → **DNS-01**: selecciona el `certificate_id` del wildcard `*.negri.es`
  ya presente en NPM. La app lo resuelve listando los certificados de NPM y casando por
  `*.negri.es` / `negri.es`. No emite cert nuevo. (DNS-01 es exclusivo de privados.)

### 3. Reconciliación
- Compara el **estado deseado** (nuestra DB) con el **estado real** (NPM + Cloudflare o
  Mikrotik) y repara lo que falte o diverja.
- Por dominio o para toda la flota. Reporta por dominio qué se creó/reparó.
- Refresco periódico del estado desde la UI (polling a `/api/status`).

## UI / Estilo

- Estética **minimalista y moderna**, con acentos **tipo neón** (bordes/glow) para los
  estados de sincronización.
- Layout principal: **tabla densa** de dominios con badges de estado por proveedor y
  acciones inline; formulario/modal de alta con selección de tipo (público/privado).
- Tailwind 4 para todo el estilado. Definir tokens (colores neón por estado, radios,
  sombras/glow) con `@theme` en el CSS global.
- Diseñar el layout y **todos los estados** (loading, vacío, error, synced/drift/missing,
  sin clasificar) **antes** de implementar, usando ux-engine.

## Desarrollo

Arrancar el servidor de desarrollo en segundo plano:

```
astro dev --background
```

Gestionar el servidor con `astro dev stop`, `astro dev status` y `astro dev logs`.

Variables de entorno (dev en `.env`, no commitear):

```
DATABASE_URL=postgresql://user:pass@pgbouncer-host:6432/dbshared?options=-csearch_path%3Dproxy_control
NPM_BASE_URL=http://npm.lan:81
NPM_EMAIL=...                 # + NPM_PASSWORD (auth de NPM)
NPM_PASSWORD=...
SESSION_SECRET=...            # firma de la cookie de sesión
SETTINGS_KEY=...              # OBLIGATORIA: cifra los secretos de proveedores DNS en la DB
```

> **Config de proveedores DNS (Cloudflare/Mikrotik): ya NO por env.** Vive en la DB (tabla
> `proxy_control.dns_providers`) y se edita desde el panel web **Ajustes → Proveedores DNS**;
> los secretos se guardan **cifrados** (AES-256-GCM con `SETTINGS_KEY`). Las variables
> `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `PUBLIC_IP`, `MIKROTIK_*` y `NPM_INTERNAL_IP`
> son **legacy/opcionales**: si están presentes en el primer arranque se usan solo para el
> **seed** inicial de los proveedores. **Cloudflare es multizona**: basta el token; las zonas
> se cargan en vivo y se eligen por dominio en el formulario (match por hostname, o ninguna).

## Docker / Infra

Todo lo de despliegue vive en **`infra/`** en la raíz, con el **`Dockerfile` multi-stage
(Node 24)** compartido. Dos entornos: **dev** (todo autocontenido en local) y **prod**
(integrado con el core de `pi-infra`). Sigue el patrón de `apps/wake-lan-app` (sin
subnivel `prod` en pi-infra) y la observabilidad por-app de `powerlog`.

```
infra/
  Dockerfile              # multi-stage Node 24 (base → deps → build → prod-deps → runtime, + dev)
  dev/    compose.yml  .env.example      # stack LOCAL completo (ver abajo)
  prod/   compose.yml  proxy-control.env.example  scrape.d/   # app + obs propia
  observability/        # única fuente de configs (prometheus, loki, alloy, alertmanager, grafana/*)
scripts/sync-pi-infra.sh                 # sube prod + obs a pi-infra por PR
.github/workflows/sync-pi-infra.yml      # abre PR a pi-infra y auto-merge
```

```
docker compose -f infra/dev/compose.yml up --build     # o: npm run docker:dev
docker compose -f infra/prod/compose.yml up --build -d   # o: npm run docker:prod (normalmente vía pi-infra)
```

- **Dev — stack completo, sin pgbouncer.** `infra/dev/compose.yml` es autocontenido y no
  toca el core: app (target `dev`, hot reload), **`postgres` directo (sin pgbouncer, no
  necesario en dev)** y observabilidad local COMPLETA (**Grafana :3000, Prometheus, Loki,
  Alloy**). `DATABASE_URL` → `postgres:5432`.
- **Prod — DB/pgbouncer/Grafana del core.** `infra/prod/compose.yml` **no** despliega
  postgres, pgbouncer ni grafana: usa los del core uniéndose a sus redes externas **`db`**
  (postgres/pgbouncer) y **`monitoring`** (para que la Grafana del core consulte
  `proxy-control-prometheus`/`-loki`). La app trae su **propia** obs (`proxy-control-{prometheus,
  loki,alloy}`). Runtime → `pgbouncer:6432`; migraciones → `postgres:5432` directo.
  Se expone por el **NPM del core** (no publica puertos). Secretos en `proxy-control.env`
  solo en la Pi (`*.env.example` versionado).
- **Sync a pi-infra (por PR), sin subnivel prod.** `scripts/sync-pi-infra.sh` espeja
  `infra/prod/` → `apps/proxy-control/` (reescribiendo `../observability` → `./observability`),
  `infra/observability/` (menos grafana) → `apps/proxy-control/observability/`, dashboards →
  `core/grafana/dashboards/proxy-control/` y datasources → `core/grafana/provisioning/
  datasources/proxy-control.yml`, y cablea el include raíz. Lo dispara el workflow
  `sync-pi-infra.yml` al hacer push a `main`.
- El servidor SSR corre con `@astrojs/node` standalone en `HOST`/`PORT` (4321). **No usa
  `network_mode: host`**: solo HTTP/HTTPS saliente (NPM, Cloudflare, Mikrotik, Postgres).
- La app solo expone `/metrics` y `/health`; su Prometheus los scrapea y Alloy recoge logs.

## Documentación

Documentación completa: https://docs.astro.build

Consultar estas guías antes de trabajar en tareas relacionadas:

- [Añadir páginas, rutas dinámicas o middleware](https://docs.astro.build/en/guides/routing/)
- [Trabajar con componentes Astro](https://docs.astro.build/en/basics/astro-components/)
- [Usar componentes de framework (React, Preact, etc.)](https://docs.astro.build/en/guides/framework-components/)
- [Renderizado bajo demanda / SSR y adaptadores](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Endpoints (API routes)](https://docs.astro.build/en/guides/endpoints/)
- [Añadir estilos o usar Tailwind](https://docs.astro.build/en/guides/styling/)

Referencias de integraciones:

- Nginx Proxy Manager API: https://nginxproxymanager.com/api/
- Cloudflare API (DNS records): https://developers.cloudflare.com/api/
- RouterOS 7 REST API: https://help.mikrotik.com/docs/display/ROS/REST+API
