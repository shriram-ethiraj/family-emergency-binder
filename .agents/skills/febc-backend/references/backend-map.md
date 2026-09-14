# Backend map

## Runtime and HTTP

- `src/index.ts` loads `.env`, resolves workspace directories, and starts the localhost server.
- `src/app.ts` builds Fastify, applies host/origin and security-header checks, owns in-memory sessions and rate limits, checks CSRF on mutations, and defines `/api` routes.
- `src/types.ts` contains backend domain and template types. Keep public response shapes synchronized with `apps/frontend/src/lib/domain.ts`.
- Shared application identity, cookie, vault filename, and cryptographic namespace constants live in `src/branding.ts`.

## Persistence and generation

- `src/vault.ts` owns profiles, encrypted JSON records, document revisions, archive/purge behavior, generation receipts, audit events, key wrapping, AAD binding, and serialized per-profile mutations.
- `src/storage.ts` owns the single native `node:sqlite` database, process-lifetime exclusive SQLite locking, schema compatibility checks, foreign keys, integrity checks, permissions, and transactional rollback. Avoid bypassing the vault and storage layers from HTTP handlers.
- `src/definitions.ts` validates and compiles versioned template JSON; `src/template-thumbnails.ts` prepares cached previews.
- `src/pdf.ts` renders protected PDFs and persists them with exclusive filenames and SHA-256 receipts.

## Verification

- `app.test.ts` covers HTTP security and full API workflows; `vault.test.ts` covers persistence and tamper behavior; `crypto.test.ts`, `definitions.test.ts`, and `pdf.test.ts` cover their respective boundaries.
- Prefer focused tests beside the owning module, then run the backend suite.
