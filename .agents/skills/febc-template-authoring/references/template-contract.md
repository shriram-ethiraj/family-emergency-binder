# Template contract

## Source layout

- Templates live at `definitions/templates/<templateId>/<version-file>.json`.
- The category folder must equal `templateId`; IDs use lowercase kebab-case and `version` must be valid semantic versioning.
- The JSON `templateId` and `version` are authoritative. The filename only controls discovery order.
- The browser artifact embeds bundled Noto Sans files under `definitions/assets/fonts`; templates cannot load runtime assets.

## Fields and layout

- Required top-level values are `templateId`, `version`, `name`, `description`, `fields`, and `layout`.
- Each field has a label, `string`/`number`/`boolean` type, and an explicit fictional `example`. Optional validation, input, formatter, placeholder, and enum properties must match the compiler allowlists in `src/lib/template-catalog.ts`.
- Every field must appear exactly once through a `section` or `pairedTable`. Layout also supports title, subtitle, text, spacer, and page-break nodes.
- Bindings may reference declared `document.*` fields or the approved `system.generatedAt`, `system.documentRevision`, and `system.profileRevision` values.
- Templates cannot reference remote assets or paths escaping their category directory or bundled font directory.

## Publishing behavior

- Saved documents remain pinned to the template version chosen at creation.
- The browser build embeds source templates, fictional thumbnails, fonts, and the PDF renderer. Documents store an encrypted compiled snapshot and content hash for their pinned version.
- Published `templateId@version` content is immutable. Create a new version for content changes.
