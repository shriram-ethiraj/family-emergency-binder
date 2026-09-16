# Template contract

## Source layout

- Templates live at `definitions/templates/<templateId>/<version-file>.json`.
- The category folder must equal `templateId`; IDs use lowercase kebab-case and `version` must be valid semantic versioning.
- The JSON `templateId` and `version` are authoritative. The filename only controls discovery order.
- The release copies templates to `templates/` and packages Noto Sans separately as fixed application assets. Templates cannot load runtime assets.

## Fields and layout

- Required top-level values are `templateId`, `version`, `name`, `description`, `fields`, and `layout`.
- Each field has a label, `string`/`number`/`boolean` type, and an explicit fictional `example`. Optional validation, input, formatter, placeholder, and enum properties must match the compiler allowlists in `src/lib/template-catalog.ts`.
- Every field must appear exactly once through a `section` or `pairedTable`. Layout also supports title, subtitle, text, spacer, and page-break nodes.
- Bindings may reference declared `document.*` fields or the approved `system.generatedAt`, `system.documentRevision`, and `system.profileRevision` values.
- Templates cannot reference remote assets or paths escaping their category directory or bundled font directory.

## Publishing behavior

- At the start of each page session, the user selects the release's `templates/` folder. The app scans JSON recursively, accepts direct or nested files, and keeps compiled templates only in memory.
- Duplicate `templateId@version` files resolve to the valid file with the newest modification time, with relative path as a deterministic tie-breaker. Reusing a version can therefore change matching documents; create a new version for stable historical output.
- Documents store an encrypted compiled snapshot and content hash. The snapshot is used when the selected catalog no longer contains that ID/version.
