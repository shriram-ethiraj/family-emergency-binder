---
name: febc-frontend
description: Implement or review Family Emergency Binder Creator React UI, routing, forms, client state, accessibility, and browser behavior. Do not use for backend-only, template-only, or security-audit requests.
---

# FEBC frontend work

Use this skill for changes under `src`, root frontend configuration, or browser-facing workflows.

1. Read [references/frontend-map.md](references/frontend-map.md) before scanning broadly.
2. Trace the affected route, feature, query, and shared component from that map.
3. Preserve route-driven overlays, query-key ownership, session cleanup, responsive behavior, and keyboard accessibility.
4. Reuse the locally owned UI components before adding dependencies or one-off primitives.
5. Test observable behavior. Run the frontend checks in the root `AGENTS.md`, plus end-to-end tests when a critical workflow changes.

Explicit user requirements take precedence over this workflow. Update the reference when the frontend architecture changes.
