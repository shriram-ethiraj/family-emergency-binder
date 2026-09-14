---
name: febc-backend
description: Implement or review Family Emergency Binder Creator Fastify APIs, vault persistence, revisions, generation receipts, PDF output, and server behavior. Do not use for UI-only, template-authoring-only, or dedicated security reviews.
---

# FEBC backend work

Use this skill for changes under `apps/backend`, server startup, or API behavior.

1. Read [references/backend-map.md](references/backend-map.md) before scanning broadly.
2. Identify the owning layer: HTTP/session orchestration, vault domain operations, outer storage, template compilation, or PDF output.
3. Keep mutations serialized and durable, preserve document/template revision pinning, and keep API/domain types aligned with the frontend.
4. Do not expose private field values in filenames, logs, errors, receipts, previews, or tests.
5. Run the backend checks in the root `AGENTS.md`; add end-to-end coverage when the browser contract changes.

Use `febc-security-review` as well when touching authentication, cryptography, sensitive memory, filesystem boundaries, or protected output. Explicit user requirements take precedence. Update the reference when backend architecture changes.
