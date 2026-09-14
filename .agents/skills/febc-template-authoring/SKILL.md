---
name: febc-template-authoring
description: Create, revise, or validate Family Emergency Binder Creator JSON templates, example data, layouts, PDF bindings, versions, and thumbnails. Do not use for general frontend or unrelated backend work.
---

# FEBC template authoring

Use this skill for work under `definitions/templates` or changes to the template compiler contract.

1. Read [references/template-contract.md](references/template-contract.md) before editing a template or compiler rule.
2. Keep every example fictional and safe for public previews and API responses.
3. Add a new semantic version instead of changing content already recorded in the cache manifest for an existing `templateId@version`.
4. Keep field definitions, UI sections, layout bindings, PDF formatting, and example values consistent.
5. Run `pnpm templates:prepare` and `pnpm test:server`; visually inspect generated output when layout or pagination changes.

Explicit user requirements take precedence, except that real personal data must never enter repository templates or fixtures. Update the reference when the contract changes.
