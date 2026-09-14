# Family Emergency Binder Creator

## Product and repository

- This is a private, local-first application for creating and managing printable family emergency binders.
- The supported security boundary is a single-user localhost deployment. Do not imply that the app protects an unlocked session from the host OS, malware, browser extensions, screenshots, or a privileged user.
- `apps/frontend` is the React/Vite client, `apps/backend` is the Fastify service, and `definitions/templates` is the source of truth for binder templates.
- Use pnpm 10.11 with Node.js 24.21 or later. Do not substitute npm or yarn.

## Working agreements

- Read the matching repository skill before broad source searches: `febc-frontend`, `febc-backend`, `febc-template-authoring`, or `febc-security-review`.
- If a change makes a skill reference inaccurate, update that reference in the same change.
- Never add real family information to templates, examples, fixtures, tests, screenshots, logs, issues, or documentation. Template examples must be obviously fictional.
- Never commit vault files, generated PDFs, `.env`, recovery keys, private keys, `vault-data`, `runtime-data`, or `output` contents.
- Templates may not load remote assets or execute code. Keep generated output and template assets local.
- Treat persisted vault formats, cryptographic labels, session handling, filesystem writes, and PDF protection as security-sensitive changes.
- Preserve unrelated user changes. Ask before adding production dependencies.

## Verification

- Frontend-only: `pnpm lint && pnpm test:client && pnpm --filter @family-emergency-binder/frontend typecheck`.
- Backend-only: `pnpm test:server && pnpm --filter @family-emergency-binder/backend typecheck`.
- Template changes: `pnpm templates:prepare && pnpm test:server`.
- Security-sensitive or cross-cutting changes: `pnpm security:repo-check && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Run `pnpm test:e2e` when a user workflow, route, authentication behavior, or PDF-generation flow changes.
