# Self-host (Single Machine) Docker Compose

This guide describes the recommended single-machine self-host setup using Docker Compose.

It provides:

- Postgres 16 with `pgvector`
- Valkey (Redis-compatible)
- Meilisearch
- RustFS (S3-compatible object storage)
- Traefik edge (optional profile) for `example.com` / `app.example.com` / `api.example.com`
- Dev-only tools (optional profile): Mailpit, Dozzle

The application processes (API/Admin/Portal) are assumed to run on the host machine for now.
Traefik proxies traffic to host ports via `host.docker.internal`.

---

## Prerequisites

- Docker + Docker Compose v2
- A single machine with ports **80** and **443** available (for Traefik edge)
- DNS records pointing to the machine public IP:
  - `example.com`
  - `app.example.com`
  - `api.example.com`

If you only want local development without public DNS/TLS, use the minimal infra profile
and access services via `localhost` ports.

---

## Profiles and Commands

### Baseline (default)

Starts database/search/storage dependencies.

```bash
pnpm infra:up
```

### Edge (Traefik, recommended for self-host)

Starts Traefik edge + baseline dependencies.

```bash
pnpm infra:up:edge
```

Notes:

- `infra:up:edge` binds ports **80/443**. Do not run it at the same time as `infra:up:saas`
  (which also binds port 80).
- If you already have something on 80/443 (nginx/caddy), keep using your existing edge
  and start `infra:up` instead.

### Devtools (Mailpit, Dozzle)

```bash
pnpm infra:up:devtools
```

Both services bind to `127.0.0.1` only.

---

## Service Endpoints (host access)

The compose file maps dependency ports to `127.0.0.1` by default, so host processes can
connect while the services remain unreachable from the public Internet.

- Postgres: `127.0.0.1:5432`
- Valkey: `127.0.0.1:6379`
- Meilisearch: `127.0.0.1:7700`
- RustFS (S3 API): `127.0.0.1:9000`
- RustFS (console): `127.0.0.1:9001`
- Mailpit SMTP (devtools): `127.0.0.1:1025`
- Mailpit UI (devtools): `http://127.0.0.1:8025`
- Dozzle UI (devtools): `http://127.0.0.1:9999`

---

## Traefik Edge (host upstream)

The edge profile uses a small `edge-routes` container with Traefik labels to define routes.

### Hostnames (defaults)

- Portal: `example.com`
- Admin: `app.example.com`
- API: `api.example.com`

You can override them with environment variables for `docker compose`:

- `SELFHOST_PORTAL_HOST`
- `SELFHOST_ADMIN_HOST`
- `SELFHOST_API_HOST`

### Upstreams (defaults)

- Portal: `http://host.docker.internal:3100`
- Admin: `http://host.docker.internal:5173`
- API: `http://host.docker.internal:8000`

Overrides:

- `SELFHOST_PORTAL_UPSTREAM`
- `SELFHOST_ADMIN_UPSTREAM`
- `SELFHOST_API_UPSTREAM`

### TLS / ACME (Let's Encrypt)

The edge profile is configured for ACME HTTP-01 and HTTP->HTTPS redirect.

Recommended production env:

- `TRAEFIK_ACME_EMAIL=you@example.com`

Troubleshooting checklist if certificate issuance fails:

- Port 80 reachable from the Internet (HTTP-01 challenge uses it)
- DNS A/AAAA records point to the correct machine
- No other service is binding to 80/443
- Check Traefik logs: `docker logs celestial-traefik-edge`

---

## Application (Host) Configuration

### API: Postgres + Valkey

Point your host API process to the compose services via loopback:

- `DATABASE__HOST=127.0.0.1`
- `DATABASE__PORT=5432`
- `DATABASE__NAME=celestial` (or your choice)
- `DATABASE__USER=postgres` (or your choice)
- `DATABASE__PASSWORD=...`

Valkey:

- `VALKEY__ENABLED=1`
- `VALKEY__HOST=127.0.0.1`
- `VALKEY__PORT=6379`

### API: pgvector

On a fresh database volume, the init script enables `pgvector` automatically:

- `docker/postgres/initdb/001_pgvector.sql`

If you already have an existing `postgres_data` volume, run once:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### API: RustFS (S3-compatible storage)

The API already supports an S3-compatible storage backend.

Example env values for RustFS:

- `STORAGE__PROVIDER=s3`
- `STORAGE__S3_ENDPOINT_URL=http://127.0.0.1:9000`
- `STORAGE__S3_BUCKET=celestial`
- `STORAGE__S3_ACCESS_KEY_ID=rustfsadmin`
- `STORAGE__S3_SECRET_ACCESS_KEY=rustfsadmin`
- `STORAGE__S3_FORCE_PATH_STYLE=1` (recommended for many S3-compatible servers)

You must create the bucket (either via RustFS console or API tooling) before uploads work.

Security notes:

- Do not use the default access/secret keys in production.
- Consider keeping RustFS ports bound to localhost and letting the API upload via presigned URLs
  only when appropriate.

### API: Meilisearch

Meilisearch is included as an optional dependency in compose.

- Endpoint: `http://127.0.0.1:7700`
- Master key (compose default): `dev-master-key`

Production note:

- Set `MEILI_MASTER_KEY` to a strong random value and do not commit it to git.

### API: Mailpit (devtools)

If you enable email sending locally, point the API mail settings to Mailpit:

- `MAIL__ENABLED=1`
- `MAIL__SERVER=127.0.0.1`
- `MAIL__PORT=1025`
- `MAIL__STARTTLS=0`
- `MAIL__SSL_TLS=0`
- `MAIL__USE_CREDENTIALS=0`

Then open Mailpit UI: `http://127.0.0.1:8025`.

---

## Security Notes (Important)

- Dozzle mounts `/var/run/docker.sock`. Keep it in the `devtools` profile only and bind the UI
  to `127.0.0.1`.
- This compose stack uses fixed `container_name` values, so you cannot run multiple stacks on the
  same host simultaneously without changes.
- Keep all secrets (DB passwords, Meilisearch key, RustFS keys, ACME email) in a private `.env`
  file outside of git.
