# EC2 deployment

This is a single-instance deployment with MySQL and website files on persistent disk. Caddy runs directly on EC2, obtains SSL certificates automatically, redirects HTTP to HTTPS, and renews certificates. No ALB, ACM certificate, or Nginx is required.

## Infrastructure

1. Create an EC2 Linux instance with Docker Engine and Compose v2. Allow enough memory for Next.js builds and MySQL (4 GiB is a practical starting point; measure your workload). Build images in CI if the instance is memory constrained.
2. Mount an encrypted EBS volume at `/srv/launch-data`. Keep it across instance replacement and enable snapshots/backups.
3. Associate an Elastic IP with the instance. Set DNS A records for `desk.example.com` and `*.sites.example.com` to that IP. Both must use the same registrable parent domain. Remove stale AAAA records unless IPv6 also reaches this instance. Keep DNS unproxied for initial certificate validation.
4. Open inbound TCP 80 and 443; optionally UDP 443 for HTTP/3. Restrict SSH to your management IP or use SSM. Do not expose MySQL or Next.js ports. Caddy needs outbound HTTPS access to the certificate authority.
5. Set the environment below. Caddy persists its certificate keys and renewal state under `/srv/launch-data/caddy/`. Do not delete this directory on release updates.

```dotenv
APP_ORIGIN=https://desk.example.com
APP_HOST=desk.example.com
SITE_BASE_DOMAIN=sites.example.com
SITE_PROTOCOL=https
ACME_EMAIL=your-operations-email@example.com
CADDYFILE=./deploy/Caddyfile
DATA_ROOT=/srv/launch-data
MYSQL_DATABASE=launch
MYSQL_USER=launch
MYSQL_PASSWORD=<random hex password>
MYSQL_ROOT_PASSWORD=<different random hex password>
SESSION_SECRET=<at least 32 random characters>
TLS_ASK_SECRET=<different secret with at least 32 random characters>
HTTP_PORT=80
HTTPS_PORT=443
```

Use `openssl rand -hex 24` for passwords and `openssl rand -hex 32` for secrets. Hex passwords avoid escaping issues in the database URL. Compose supplies its internal `DATABASE_URL`; local CLI scripts use the local `.env` value. Never put `.env` in Git or images.

Caddy obtains the admin certificate automatically. Website and preview certificates are issued on their first HTTPS connection. Its private `ask` endpoint permits only stored design/revision hostnames and requires `TLS_ASK_SECRET`; public access to that endpoint is blocked by Caddy. Wildcard **DNS** is required, but this configuration uses individual certificates, so no DNS-provider API key is needed. The first preview can take several seconds while its certificate is issued. Certificate-authority rate limits apply when many new designs/revisions are opened. For high-volume operation, use a Caddy DNS-provider module and a wildcard certificate once the DNS provider is known.

This follows Caddy's [automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [on-demand certificate permission](https://caddyserver.com/docs/caddyfile/options#on-demand-tls) documentation.

## Start

Copy the project to the instance, edit `.env`, then run from the project root:

```bash
chmod 600 .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app migrate db
```

The database must be healthy before migration runs. The app waits for successful migration and storage-directory ownership initialization. Caddy waits for app readiness. Only the website root directory is assigned to UID 1001; the app runs without root or Linux capabilities.

Create the first account from Bash:

```bash
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (12+ characters): ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose --profile tools run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD admin
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Visit `https://desk.example.com`. Upload a website and preview it. Check CSS, images, and nested pages. Click Publish, then use the external link in the design row. Verify that unpublished websites return 404. CEA/agency information comes from the supplied prototype and should be reviewed before publication.

For a Docker-only local trial, set `CADDYFILE=./deploy/Caddyfile.local` and `HTTPS_PORT=8443`, use `APP_ORIGIN=http://launch.localhost:8080`, `SITE_BASE_DOMAIN=launch.localhost:8080`, `SITE_PROTOCOL=http`, and `HTTP_PORT=8080`, and run Compose normally. This local Caddyfile serves HTTP without requesting public certificates. Restart/recreate the containers whenever these environment values change. The production image reads these values at runtime.

## Updates

Back up before each release. Retain the previous image tag or source release so it can be redeployed.

```bash
bash scripts/backup.sh /srv/launch-backups/pre-release
# Copy the new release into the project directory.
docker compose build app migrate
docker compose run --rm migrate
docker compose up -d --force-recreate app caddy
```

Existing migrations are tracked in `schema_migrations`. MySQL DDL is not transactionally rolled back, so future migration files should be rerunnable and designed for staged upgrades. Initial schema creation uses `IF NOT EXISTS`. Schema rollback is a deliberate restore/migration operation, not something the application does automatically.

## Backups

```bash
bash scripts/backup.sh /srv/launch-backups/2026-09-08
```

Back up the persistent `caddy` directory separately along with your deployment secrets to retain certificate/account keys. The script stops the app while writing a logical MySQL dump and an archive of website files, then restarts it even on failure. This briefly interrupts service and preserves consistency between database pointers and files. Run it from Bash on Linux, with adequate free disk space. Backups contain client data and website source: encrypt and copy them off the instance. Never rely only on the EC2 root disk. Keep the `.env` secrets separately in your secret manager.

Restore into a new, empty deployment with the same application release. Verify backup checksums first and stop all application writers. Restoring overwrites the target deployment's data; do this only against the intended recovery environment.

```bash
docker compose stop app caddy
docker compose up -d db storage-init
# Wait until the database is healthy, then import into the EMPTY target database.
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"' < /absolute/backup/database.sql
# The target websites directory must be empty and writable by UID 1001.
docker compose run --rm --no-deps -T --entrypoint tar app -C /data/websites -xzf - < /absolute/backup/websites.tar.gz
docker compose up -d app caddy
```

Do not extract untrusted backup archives. Test restorations periodically and verify both a published website and a saved revision.

## Operational boundaries

- All authenticated users are workspace administrators. There is no per-client tenancy or role-based permission system.
- Filesystem storage assumes one writable application instance. Multiple instances would need shared filesystem storage and coordinated deployment/migrations.
- Static websites are supported. Upload a built static export from a framework; uploaded application servers are not launched.
- The current release retains every revision and publication snapshot. Add disk alarms and a database-aware retention process before sustained large uploads.
- No AWS resources or domain records are provisioned by this repository. Actual deployment requires your EC2 environment, DNS, and TLS configuration.

## Existing shared Caddy on this EC2 instance

The `jome-content` instance already serves other applications using `jome-content-os-caddy-1`. Design CRM uses `compose.shared-caddy.yaml` to avoid binding existing public ports. Only the private gateway joins the existing `jome-content-os_default` network, with the alias `design-crm-gateway`; MySQL and Next.js remain on the Design CRM network.

Deployment checkout: `/opt/design-crm`. Persistent files: `/srv/design-crm-data`.

```bash
# .env contains CADDY_NETWORK=jome-content-os_default
cd /opt/design-crm
git pull --ff-only origin main
docker compose -f compose.yaml -f compose.shared-caddy.yaml up -d --build
```

Merge `deploy/Caddyfile.edge-snippet` into the existing gateway's Caddyfile, preserving its other host blocks and merging any global settings. Back up and validate the full config, then reload Caddy; do not stop existing apps. The new gateway's private port 8081 supplies the certificate-authorization token from its environment. The shared Caddyfile therefore contains no Design CRM secret.

For this topology, use the same two Compose files for updates, admin creation and backups. The backup script accepts `COMPOSE_FILE=compose.yaml:compose.shared-caddy.yaml`. Back up the shared gateway's existing certificate volume as part of the host's normal backups.
