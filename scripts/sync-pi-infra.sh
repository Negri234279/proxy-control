#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sync proxy-control's infra into a pi-infra checkout, per the agreed CONTRACT.
#
# Used by .github/workflows/sync-pi-infra.yml (CI) and runnable locally to test:
#   scripts/sync-pi-infra.sh /path/to/pi-infra
#
# CONTRACT — what the central pi-infra repo consumes from this app (source → dest).
# proxy-control has NO prod sublevel in pi-infra: the prod stack lands directly at
# apps/proxy-control/ (like apps/wake-lan-app/), and its observability configs sit
# beside it at apps/proxy-control/observability/. Because the source compose mounts
# ../observability (valid in-repo, where infra/prod/ and infra/observability/ are
# siblings), the landed compose is rewritten to ./observability so the mounts stay
# valid under the collapsed layout.
#
#   infra/prod/ (minus observability/, domains.d/) → apps/proxy-control/      (the app stack, mirror)
#   infra/prod/domains.d/                       → apps/proxy-control/domains.d/ (ADITIVO, no prune)
#   infra/observability/ (minus grafana/)      → apps/proxy-control/observability/ (configs prod mounts)
#   infra/observability/grafana/dashboards/*.json (except postgresql-9628.json)
#                                              → core/grafana/dashboards/proxy-control/
#   infra/observability/grafana/provisioning/datasources/datasources.yaml
#                                              → core/grafana/provisioning/datasources/proxy-control.yml
#
# NOT synced / NEVER pruned:
#   - real *.env secrets (only *.env.example is tracked / copied).
#   - pi-infra-owned panels under apps/proxy-control/domains.d/ (e.g. nas.yaml, network.yaml):
#     domains.d is synced ADDITIVELY (step 1c) and excluded from the destructive mirror, so
#     configs you create directly in pi-infra are updated-if-present but never deleted.
#   - the Postgres dashboard (the SHARED Postgres "Databases" dashboard is
#     core-owned; pi-infra owns it).
#   - the root docker-compose.yml include line (idempotent; checked + wired).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP="proxy-control"

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:?usage: sync-pi-infra.sh <pi-infra-checkout-dir>}"
DEST="$(cd "$DEST" && pwd)"

log() { printf '[sync] %s\n' "$*"; }

# Mirror a dir (prune files removed at source). Prefer rsync (CI); cp fallback for
# local runs without rsync. Real *.env secrets are never copied nor pruned. Extra
# rsync excludes can be passed as trailing args (rsync protects them from copy AND delete).
mirror_dir() {
  local src="$1" dst="$2"; shift 2
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude '*.env' "$@" "$src/" "$dst/"
  else
    # Fallback ADITIVO: cp copia/actualiza desde el origen pero NUNCA borra ficheros que
    # solo existan en el destino. No emula el pruning de `rsync --delete` (solo afecta a
    # runs locales sin rsync; CI tiene rsync y poda). Importante: a diferencia de rsync,
    # aquí NO borramos los dirs `--exclude` del destino — hacerlo destruiría datos que son
    # propiedad de pi-infra (p. ej. apps/proxy-control/domains.d/*.yaml).
    cp -r "$src/." "$dst/"
    find "$dst" -type f -name '*.env' ! -name '*.env.example' -delete 2>/dev/null || true
    log "  (rsync ausente: cp fallback aditivo — sin pruning de ficheros obsoletos)"
  fi
}

# 1) App stack → apps/proxy-control/  (NO prod sublevel).
#    Exclude observability/ so mirroring the app stack never prunes the sibling
#    obs configs synced in step 2 (rsync protects excluded paths from --delete;
#    the cp fallback stays correct because step 2 runs AFTER this).
log "app stack: infra/prod/ → apps/$APP/ (minus observability, minus domains.d)"
# domains.d se excluye del mirror DESTRUCTIVO: es propiedad de pi-infra (los panels reales
# viven allí). Se sincroniza aparte de forma ADITIVA en el paso 1c (no se poda nada).
mirror_dir "$SRC_ROOT/infra/prod" "$DEST/apps/$APP" --exclude 'observability/' --exclude 'domains.d/'

# 1b) Rewrite the landed compose's obs mounts for the collapsed layout:
#     ../observability → ./observability (obs now sits beside compose.yml).
if [ -f "$DEST/apps/$APP/compose.yml" ]; then
  sed -i 's#\.\./observability#./observability#g' "$DEST/apps/$APP/compose.yml"
  log "rewrote ../observability → ./observability in apps/$APP/compose.yml"
fi

# 1c) domains.d → apps/proxy-control/domains.d  (ADITIVO, sin --delete).
#     Copia/actualiza lo que exista en infra/prod/domains.d (el panels.yaml.example y
#     cualquier YAML que SÍ versiones en proxy-control), pero NUNCA borra los panels que
#     crees directamente en pi-infra (nas.yaml, network.yaml, …): esos son suyos.
if [ -d "$SRC_ROOT/infra/prod/domains.d" ]; then
  mkdir -p "$DEST/apps/$APP/domains.d"
  cp -r "$SRC_ROOT/infra/prod/domains.d/." "$DEST/apps/$APP/domains.d/"
  log "domains.d: infra/prod/domains.d → apps/$APP/domains.d/ (aditivo; no poda)"
fi

# 2) Shared obs configs (minus grafana/, which goes to core) → apps/proxy-control/observability/
#    (prod's compose mounts ./observability → apps/proxy-control/observability after sync.)
log "obs configs: infra/observability/ (minus grafana) → apps/$APP/observability/"
mirror_dir "$SRC_ROOT/infra/observability" "$DEST/apps/$APP/observability" --exclude 'grafana/'

# 3) App dashboards → core/grafana/dashboards/proxy-control/
#    All dashboards except postgresql-9628.json (pi-infra owns the SHARED Postgres
#    "Databases" dashboard). Copying by pattern means new dashboards sync themselves.
log "dashboards → core/grafana/dashboards/$APP/"
mkdir -p "$DEST/core/grafana/dashboards/$APP"
if [ -d "$SRC_ROOT/infra/observability/grafana/dashboards" ]; then
  find "$SRC_ROOT/infra/observability/grafana/dashboards" -maxdepth 1 -type f -name '*.json' \
    ! -name 'postgresql-9628.json' \
    -exec cp {} "$DEST/core/grafana/dashboards/$APP/" \;
fi

# 4) App datasources → core/grafana/provisioning/datasources/proxy-control.yml
log "datasources → core/grafana/provisioning/datasources/$APP.yml"
mkdir -p "$DEST/core/grafana/provisioning/datasources"
if [ -f "$SRC_ROOT/infra/observability/grafana/provisioning/datasources/datasources.yaml" ]; then
  cp "$SRC_ROOT/infra/observability/grafana/provisioning/datasources/datasources.yaml" \
     "$DEST/core/grafana/provisioning/datasources/$APP.yml"
fi

# Wire the app into the root include (idempotent): the action manages this too,
# so a fresh pi-infra checkout needs no manual edit.
if [ -f "$DEST/docker-compose.yml" ]; then
  if ! grep -qF "apps/$APP/compose.yml" "$DEST/docker-compose.yml"; then
    sed -i "/-[[:space:]]*core\/docker-compose.yml/a\\  - apps/$APP/compose.yml" "$DEST/docker-compose.yml"
    log "added include: - apps/$APP/compose.yml to root docker-compose.yml"
  fi
else
  log "WARNING: $DEST/docker-compose.yml not found — cannot wire the include."
fi

log "done."
