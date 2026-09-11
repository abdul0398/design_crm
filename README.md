# Launch Design Desk

A native Next.js App Router conversion of the supplied Launch dashboard. React renders the workspace; real API routes save data to MySQL 8.4 and uploaded website bytes to the server filesystem. The original HTML is untouched.

## Included

- Sign-in with scrypt password hashes, database sessions, HTTP-only cookies, origin checks, and shared login attempt limits. All accounts share one design workspace.
- Eight starter projects preserved from the supplied prototype. Add projects, edit their name/location/developer/launch status, move projects to Trash, and restore them with their designs/files. Trashing immediately disables live websites and existing previews; restored websites require publication again. Imported facts and dates are not independently verified.
- Editable project names, locations, developers and launch status; design search by project, status filters, linked designs, ZIP/folder/HTML uploads, file inventories, and entry-page selection.
- Server validation of file paths, expanded upload size (50 MiB), file count (2,000), duplicates, unsupported/encrypted ZIPs, and symbolic links. No uploaded server-side code is executed.
- Individual design deletion with confirmation and per-project Design Trash. Deletion disables the live website and previews; Restore keeps current files, with explicit publishing required to go live again.
- Download ZIP for any uploaded website, including offline designs. Exports the current files with their original names and folders; requires sign-in. Linked-only designs have no ZIP.
- Per-file updates through the Files button: search existing paths and upload a replacement HTML, CSS, JavaScript, image, font or other asset. Saving replaces that file and immediately updates the same live URL, keeping every other file and the entry page intact.
- One current file set per design, automatic publication for new uploads, and a stable website URL across file replacements. No revision or republishing workflow. Explicitly offline sites remain offline when edited; Preview offers Publish/Unpublish. Status labels only organise designs.
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

Create an administrator without putting a password directly in shell history. Optionally set `ADMIN_USERNAME` (3–64 letters/numbers, dots, underscores or hyphens); when assigned, that username replaces email as the sign-in identifier. The email remains the contact address:

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
  projects                     project identity fields
  designs                      names, status, live file pointer, edit-conflict token
  revisions                    current manifest and entry point (legacy table name)

STORAGE_ROOT/
  revisions/<random-uuid>/     current uploaded files (legacy directory name)
  published/<random-uuid>/     legacy publications preserved until replaced
```

Uploads use multipart binary data, not base64 blobs. MySQL stores manifests and metadata only. ZIPs are extracted into a new private directory; file paths must stay inside it. Hidden files, `.git`, `node_modules`, and macOS metadata are excluded. Keep only static website exports: PHP, Python, Node servers, build steps, and databases inside uploaded packages are not run.

Published website files use ETag revalidation (`public, no-cache, must-revalidate`): browsers keep bytes and reuse them after a 304 response, while every request still checks current publication and file version. ZIP and single-file replacements invalidate validators immediately. Private previews, redirects, and errors are not cached. Caddy compresses eligible HTML, CSS, JavaScript, SVG, and other text responses with Zstandard or gzip, including through the shared gateway. Uploaded files and ZIP exports remain byte-for-byte unchanged. First visits still download images; large embedded images require smaller source assets for further improvement.


HTML is served exactly as uploaded. Project details, client/agency fields, and template substitutions are no longer part of the app.

Live previews use the same public website URL. Offline previews use a stable private hostname with a signed link that expires after 15 minutes and is exchanged for a scoped cookie. Existing signed preview links serve current files, not historical versions. Public HTML is delivered with a CSP sandbox; server-side code in packages cannot run. Avoid uploading service workers or websites that require top-level navigation permissions.

Trash is recoverable and retains files on disk; there is no permanent deletion or automatic trash purge. Starter projects moved to Trash stay deleted across migrations and redeployments.

Updates stage complete files, then atomically replace the current database record and live pointer. A numeric edit-conflict token prevents stale or concurrent edits from overwriting a newer save; it is not shown as a revision. Replaced directories are removed after commit when no records reference them. New saves do not create history records. Legacy history and removed metadata columns are preserved for compatibility; the app does not expose or add to them. Failed transactions clean up their staged directory where possible. A process crash can leave an unreferenced directory, so monitor disk usage and use database-aware maintenance.

Browser IndexedDB from the old HTML is not automatically imported. Re-upload original website files ; the supplied HTML and its browser storage have not been modified. The old JSON backup format is not a server restore format.

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

| Endpoint                                          | Purpose                                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login` / `POST /api/auth/logout`  | Workspace session                                                                                                                 |
| `GET /api/projects` / `POST /api/projects`        | List active projects and design counts / create a project                                                                         |
| `GET /api/projects?trash=1`                       | List deleted projects                                                                                                             |
| `GET /api/projects/:id` / `PUT /api/projects/:id` | Project name, location, developer and launch status                                                                               |
| `DELETE /api/projects/:id`                        | Move project and designs to Trash; body includes the current project `name`                                                       |
| `POST /api/projects/:id/restore`                  | Restore the project and designs, keeping websites unpublished                                                                     |
| `GET /api/library?project=:id`                    | Designs with current file inventories                                                                                             |
| `POST /api/library`                               | Create/update metadata and upload files, ZIP, and entry point                                                                     |
| `POST /api/library/:id/files`                     | Replace one existing file using multipart `path`, `file`, and `expectedRevision`; updates current files and the existing live URL |
| `GET /api/library/:id/download`                   | Download all current website files as a ZIP attachment                                                                            |
| `PATCH /api/library`                              | Change the organisational status                                                                                                  |
| `DELETE /api/library`                             | Move a design to Trash; body includes `id`, current `name`, and `expectedRevision`                                                |
| `GET /api/library?project=:id&trash=1`            | List designs in this project’s Design Trash                                                                                       |
| `POST /api/library/:id/restore`                   | Restore a design in an active project, keeping its website unpublished                                                            |
| `POST /api/preview`                               | Open the live URL or a signed offline preview                                                                                     |
| `POST /api/publish` / `DELETE /api/publish`       | Make current files live / take website offline                                                                                    |
| `GET /api/health`                                 | MySQL connectivity and writable storage readiness                                                                                 |

Implementation follows the official [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting) and [Docker's Next.js guide](https://docs.docker.com/guides/nextjs/).
