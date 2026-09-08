# Launch Design Desk

A native Next.js App Router conversion of the supplied Launch dashboard. React renders the workspace; real API routes save data to MySQL 8.4 and uploaded website bytes to the server filesystem. The original HTML is untouched.

## Included

- Sign-in with scrypt password hashes, database sessions, HTTP-only cookies, origin checks, and shared login attempt limits. All accounts share one agency workspace.
- Eight project records and four agency records preserved from the supplied prototype. These imported facts and dates are not independently verified.
- Editable project information, folder links, and client/agency details; design search by project, status filters, linked designs, ZIP/folder/HTML uploads, file inventories, and entry-page selection.
- Server validation of file paths, expanded upload size (50 MiB), file count (2,000), duplicates, unsupported/encrypted ZIPs, and symbolic links. No uploaded server-side code is executed.
- Immutable upload revisions; separate preview hostnames; public publication snapshots; unpublish. Editing files or client data never changes an existing publication until Publish is clicked again. Status labels do not take pages offline.
- Docker Compose with Next.js, MySQL, Caddy automatic HTTPS, automatic schema migration, and persistent host directories. No S3 dependency.

## Local development

Requires Node.js 22+ and Docker Compose v2. The repository includes a lockfile.

```bash
test -f .env || cp .env.example .env
# Edit .env. Generate a SESSION_SECRET with: openssl rand -hex 32
# Choose MySQL passwords using URL-safe characters, e.g. openssl rand -hex 24.
npm ci
docker compose -f compose.yaml -f compose.dev.yaml up -d db
# Wait for: docker compose ps db  -> healthy
npm run db:migrate
mkdir -p storage
```

Create an administrator without putting a password directly in shell history:

```bash
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (12+ characters): ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_PASSWORD
npm run admin:create
unset ADMIN_EMAIL ADMIN_PASSWORD
npm run dev
```

Open [launch.localhost:3000](http://launch.localhost:3000). Passwords are never seeded. Use the credentials you created. The `read -p` examples use Bash; run `bash` first if your interactive shell is Zsh.

Local settings use `APP_ORIGIN=http://launch.localhost:3000`, `SITE_BASE_DOMAIN=launch.localhost:3000`, and `SITE_PROTOCOL=http`. Chromium resolves `*.localhost` to loopback. If a local browser or resolver does not, use a local wildcard DNS entry; command-line checks can send an explicit Host header to `127.0.0.1:3000`.

The workspace and website hosts must share a registrable parent domain and protocol, so preview cookies work inside the iframe (for example, `desk.example.com` and `*.sites.example.com`). Local development uses `launch.localhost` and its subdomains for the same reason; this follows the browser [same-site rules](https://web.dev/articles/samesite-cookies-explained).

The admin hostname must differ from every uploaded-site hostname. Uploaded sites have unique origins, so `/assets/style.css`, nested relative assets, JavaScript modules, and fonts resolve against the uploaded website. Do not serve arbitrary uploads directly from Next.js `public/` or from the admin hostname.

## Storage and database

```text
MySQL
  users / sessions / login_limits
  projects                     project and client fields
  designs                      names, status, current/published revision pointers
  revisions                    manifest, entry point, immutable directory reference

STORAGE_ROOT/
  revisions/<random-uuid>/     original extracted files, never overwritten
  published/<random-uuid>/     snapshot with saved template values applied
```

Uploads use multipart binary data, not base64 blobs. MySQL stores manifests and metadata only. ZIPs are extracted into a new private directory; file paths must stay inside it. Hidden files, `.git`, `node_modules`, and macOS metadata are excluded. Keep only static website exports: PHP, Python, Node servers, build steps, and databases inside uploaded packages are not run.

Template fields are supported in HTML text and ordinary quoted attributes. They are not substituted inside scripts, styles, event handlers, or `srcdoc`. Available names:

```text
{{project_name}} {{project_location}} {{developer}} {{total_units}}
{{project_information}} {{client_name}} {{mobile}} {{cea}}
{{agency_name}} {{agency_licence}} {{agency_address}}
```

The preview URL expires after 15 minutes and is exchanged for a cookie scoped to that preview hostname. Opening another preview refreshes access. Each revision has its own origin. Publications have a stable per-design hostname. Public HTML is delivered with a CSP sandbox; server-side code in packages cannot run. Avoid uploading service workers or templates that require top-level navigation permissions.

Historical revisions remain on disk and in MySQL; the initial UI edits and publishes the latest revision. A failed transaction cleans up its new directory where possible. A process crash can leave an unreferenced directory; retain it until a database-aware maintenance/retention policy is introduced. Monitor disk usage because there is no automatic quota or history deletion.

Browser IndexedDB from the old HTML is not automatically imported. Re-upload original website files and re-enter saved details; the supplied HTML and its browser storage have not been modified. The old JSON backup format is not a server restore format.

## Deploy to EC2

See [deploy/EC2.md](deploy/EC2.md) for DNS, TLS, persistent EBS storage, startup, health checks, backups and restoration. This project is configured for your own EC2 deployment and is not published to a managed Sites host.

## Checks

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
# With MySQL migrated and the app running locally:
npm run test:integration
```

Integration tests create a temporary account/project, exercise real API calls and disk persistence, then remove only their own records/files. Use a development database.

## API

All management endpoints require a workspace session. Mutations require `Origin: APP_ORIGIN`.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/login` / `POST /api/auth/logout` | Workspace session |
| `GET /api/projects` | Projects and design counts |
| `GET /api/projects/:id` / `PUT /api/projects/:id` | Project and client fields |
| `GET /api/library?project=:id` | Designs with current file inventories |
| `POST /api/library` | Create/update metadata and upload files, ZIP, and entry point |
| `PATCH /api/library` | Change the organisational status |
| `POST /api/preview` | Create a signed URL for an existing revision |
| `POST /api/publish` / `DELETE /api/publish` | Publish latest revision / unpublish |
| `GET /api/health` | MySQL connectivity and writable storage readiness |

Implementation follows the official [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting) and [Docker's Next.js guide](https://docs.docker.com/guides/nextjs/).
