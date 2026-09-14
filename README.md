# Family Emergency Binder Creator

A private, local-first application for creating and managing printable family emergency binders. Create versioned records from self-contained templates and generate password-protected PDFs in template-defined paper sizes.

## Private storage

All profiles live in one native SQLite file named `family-emergency-binder.febcvault`. Profile names and structural record metadata remain queryable, while user-entered profile details, document labels and complete template records, receipt details, and audit subjects are stored as independently authenticated encrypted JSON blobs. Template fields never become database columns.

Passwords are never stored. A password is processed with scrypt and used to unwrap a random profile data key. The printable recovery key independently wraps the same data key and should be kept separately from the database and password.

By default, the database is created at `./vault-data/family-emergency-binder.febcvault`. This directory and every supported database/output extension are ignored by Git.

## Run with Docker

Docker Compose is the only runtime prerequisite. Install [Docker Desktop](https://docs.docker.com/desktop/) on Windows or macOS, or [Docker Engine](https://docs.docker.com/engine/install/) and the [Compose plugin](https://docs.docker.com/compose/install/linux/) on Linux. Confirm that Compose is available and the Docker service is running:

```text
docker compose version
```

From the repository directory, start the complete application:

```text
docker compose up --build
```

Docker creates the default vault, generated-output, and template-cache directories when needed. A one-shot initialization container gives them restrictive permissions before the unprivileged backend starts. Open `http://127.0.0.1:4173` after the services become healthy.

The default vault directory is `./vault-data`. Choosing another location is optional. To save a custom location, copy `.env.example` to `.env` and edit `VAULT_DIR`. For a one-time Linux or macOS launch, use:

```text
VAULT_DIR="/absolute/path/Family Emergency Binder" docker compose up --build
```

For a one-time PowerShell launch, use:

```text
$env:VAULT_DIR = "D:/Family Emergency Binder"
docker compose up --build
```

Paths with spaces are supported. Use forward slashes in Windows paths. `VAULT_DIR`, `OUTPUT_DIR`, and `TEMPLATE_CACHE_DIR` must each identify a directory dedicated to this application, not the root of a pen drive or a directory shared with unrelated files. The storage initializer recursively normalizes ownership and permissions within these directories on every startup.

Production Compose runs separate `frontend` and `backend` services. The frontend is the only published service: it serves the Vite build through an unprivileged Nginx process and proxies `/api` internally to Fastify. The backend has no published host port. Only the backend and the network-disabled storage initializer mount the vault, output, and template-cache directories; only the backend mounts the template definitions.

The host port is published only on localhost. Inside the container, the server listens on all container interfaces so Docker's port forwarding can reach it. The application services run as non-root users with read-only application filesystems. Only the configured vault, output, and template-cache mounts are writable. The storage initializer runs briefly with only the capabilities needed to set ownership and permissions, exits before the backend starts, and is not exposed on the network.

## Develop with Docker and live reload

Use the development Compose file when editing the frontend or backend:

```text
docker compose -f compose.dev.yaml up --build
```

Open `http://127.0.0.1:5173`. Changes under `apps/frontend/src` refresh the UI through Vite. Changes under `apps/backend/src` restart the API through the TypeScript watcher. The Vite proxy preserves the browser Host and Origin headers while forwarding `/api` to the internal backend. The encrypted vault and generated output still use the host directories configured in `.env`.

The development and production files intentionally use the same Compose service name. Starting one mode recreates the existing container instead of running two application servers against the same vault.

Switch back to the production build with:

```text
docker compose up --build
```

Rebuild the development image when `package.json`, the lockfile, or Docker configuration changes. Normal source edits under `src` do not require a rebuild.

## Run directly

Install Node.js 24.21.0 LTS with NVM and pnpm 10.11. No C/C++ compiler, SQLCipher installation, or system font installation is required.

```text
nvm install
nvm use
cp .env.example .env
pnpm install
pnpm build
pnpm start
```

For development, run `pnpm dev` to start both workspace packages, or run `pnpm --filter @family-emergency-binder/backend dev` and `pnpm --filter @family-emergency-binder/frontend dev` independently. The frontend runs on port 5173 and proxies `/api` to the backend on port 4173.

## Frontend architecture

The Vite frontend uses React Router data routes, TanStack Query, React Hook Form, Zod, Tailwind CSS, and locally owned Shadcn UI components. Routes are split into public and protected layouts, and feature code lives under `apps/frontend/src/features`. The primary application URLs are `/login`, `/register`, `/recover`, `/documents`, `/templates`, `/generated-files`, and `/settings`; revision history and PDF generation use route-backed overlays under `/documents/:documentId`.

Each template category under `definitions/templates/<templateId>` contains one JSON file per version, such as `v1.0.0.json` and `v1.1.0.json`. The filename is used only to discover files in natural order; the JSON `templateId` and `version` remain authoritative. Its `fields` map defines validation, form metadata, PDF formatting, and fictional `example` values once; its `layout` orders titles, sections, and field IDs for both the form and PDF. A4 page settings and bundled Noto Sans fonts are used by default. Optional local font overrides can live in the category folder.

On startup, the server validates and compiles these source templates into the runtime schema/form/PDF representation. It renders the example PDF and caches a 1200×900 PNG thumbnail in `runtime-data/template-cache` (or `TEMPLATE_CACHE_DIR`). The cache manifest protects a published `templateId@version` from changing without a version bump. Run `pnpm templates:prepare` to validate and prepare templates manually; examples must always be fictional because they are used in previews and API responses.

The smallest useful source template looks like this:

```json
{
  "templateId": "emergency-contact",
  "version": "1.0.0",
  "name": "Emergency contact",
  "description": "A short emergency contact record.",
  "fields": {
    "contactName": { "label": "Contact name", "type": "string", "required": true, "example": "Sample Contact" },
    "phone": { "label": "Phone", "type": "string", "input": "phone", "example": "+91 90000 00000" }
  },
  "layout": [
    { "type": "title", "text": "EMERGENCY CONTACT" },
    { "type": "section", "title": "Contact", "fields": ["contactName", "phone"] }
  ]
}
```

Saved documents remain pinned to the template version selected at creation time.

Recovery keys exist only in in-memory session state. Locking a profile clears the CSRF token and sensitive query data before returning to the login screen. The only browser preference persisted by the frontend is the selected light or dark theme.

Useful frontend checks are:

```text
pnpm lint
pnpm test:client
pnpm test:e2e
pnpm build
```

## Pen-drive workflow

The simplest workflow is to keep the working vault in `vault-data` and copy only `family-emergency-binder.febcvault` to or from the pen drive. If the application works directly from a pen drive, configure a dedicated subdirectory on that drive as `VAULT_DIR`; do not use the drive root.

Before copying or ejecting the drive:

1. Use **Lock profile** in the application.
2. Stop the application or container.
3. Confirm that the application is stopped. If a forced stop left a non-empty `family-emergency-binder.febcvault-journal`, start the application once so SQLite can recover it, then stop normally before copying.
4. Copy the vault file and eject the drive normally.

Never run two application instances against the same vault. Native SQLite and OS locks prevent concurrent access and are released automatically after a normal shutdown, crash, Docker `SIGKILL`, or power loss. There is no application `.lock` file to remove. Do not copy, rename, or alter the vault or its SQLite journal while the application is running.

Filesystems such as FAT/exFAT do not enforce Unix file permissions. The vault's authenticated encryption is therefore the primary protection. A strong, unique profile password remains essential.

## Repository safety

Run these checks before the first push and in CI:

```text
pnpm security:repo-check
pnpm typecheck
pnpm test
pnpm build
```

The safety check rejects tracked vaults, SQLite files, generated PDFs, `.env` files, recovery-key files, and private-key formats. The supplied DOCX is a blank visual reference and remains unchanged.

## Security boundary

Encryption protects a locked vault file or copied pen drive. It cannot protect values from malware, browser extensions, screenshots, swap, or a privileged host user while a profile is unlocked. The server makes no telemetry calls and templates cannot load remote assets or execute JavaScript.
