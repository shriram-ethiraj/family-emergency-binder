# Frontend map

## Runtime and routing

- `src/main.tsx` mounts the app; `src/App.tsx` renders the router provider.
- `src/app/providers.tsx` composes global providers. `template-context.tsx` owns the session-only catalog loaded from a selected folder; `session-context.tsx` owns selected-vault state, the active profile, inactivity lock, recovery-key memory, save status, and sensitive-query cleanup.
- `src/app/router.tsx` uses hash routing so the built app works under `file://`. Public routes select, create, unlock, and recover vaults or choose profiles. Protected routes are documents, templates, and settings; revision history and generation are route-backed document overlays.
- `public-layout.tsx` and `protected-layout.tsx` own the two shells. Shared identity strings and the package-sourced visible app version live in `src/lib/branding.ts`.

## Features and data

- `features/auth` first requires a template-folder selection, then handles vault selection/creation/unlock/recovery, browser compatibility warnings, one-time recovery-key display, and profile selection. Chromium uses writable vault handles; Firefox/Safari use file-input and encrypted-download compatibility mode.
- `features/records` owns document listing, creation/editing, dynamic template forms, actions, revisions, and PDF generation.
- `features/templates` shows session-loaded template versions, folder diagnostics, folder replacement, and fictional sample previews; `features/settings` handles profile details and vault credentials.
- `src/lib/api.ts` preserves the UI's local command interface. It never performs network requests and delegates encrypted persistence to `vault-client.ts` and `vault.worker.ts`.
- `src/lib/template-catalog.ts` bounds, validates, resolves duplicates, and compiles selected JSON files in-browser; `src/lib/pdf.ts` uses fixed package assets for PDF rendering and owns save-pickers.
- `src/lib/domain.ts` defines client API shapes. `src/lib/query-client.ts` owns query keys and sensitive-cache clearing.

## UI and verification

- Shared application components live under `components/shared`; locally owned primitives live under `components/ui`.
- Preserve label associations, focusable route overlays, keyboard activation, loading/error/empty states, mobile layouts, and theme behavior.
- Vitest setup is in `src/test`; routing coverage is in `src/app/routing.test.tsx`; the critical browser workflow is `e2e/app.spec.ts`.
- The production build writes a portable folder to `dist/family-emergency-binder/`; end users keep the HTML, fixed assets, and templates together and open the HTML directly.
