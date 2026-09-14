# Frontend map

## Runtime and routing

- `src/main.tsx` mounts the app; `src/App.tsx` renders the router provider.
- `src/app/providers.tsx` composes global providers. `session-context.tsx` owns the in-memory session, CSRF handoff, inactivity lock, recovery-key memory, and sensitive-query cleanup.
- `src/app/router.tsx` is the route source of truth. Public routes are login, register, and recover. Protected routes are documents, templates, generated files, and settings. Revision history and generation are route-backed document overlays.
- `public-layout.tsx` and `protected-layout.tsx` own the two shells. Shared identity strings live in `src/lib/branding.ts`.

## Features and data

- `features/auth` handles profile registration, unlock, recovery, and one-time recovery-key display.
- `features/records` owns document listing, creation/editing, dynamic template forms, actions, revisions, and PDF generation.
- `features/templates` shows the latest template versions and previews; `features/documents` lists generated PDFs; `features/settings` handles profile, password, recovery, and deletion.
- `src/lib/api.ts` is the only fetch wrapper and injects the in-memory CSRF token for mutations.
- `src/lib/domain.ts` defines client API shapes. `src/lib/query-client.ts` owns query keys and sensitive-cache clearing.

## UI and verification

- Shared application components live under `components/shared`; locally owned primitives live under `components/ui`.
- Preserve label associations, focusable route overlays, keyboard activation, loading/error/empty states, mobile layouts, and theme behavior.
- Vitest setup is in `src/test`; routing coverage is in `src/app/routing.test.tsx`; the critical browser workflow is `e2e/app.spec.ts`.
