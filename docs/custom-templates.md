# Creating custom templates

Family Emergency Binder Creator templates are strict JSON documents. A template defines the form shown in the browser, the validation applied to entered values, fictional preview data, and the layout of the generated PDF.

Templates cannot execute code or load local or remote assets. The application validates selected JSON files as untrusted data and keeps the compiled catalog in memory for the current page session.

## Where templates go

In an extracted release, put custom `.json` files anywhere inside the existing `templates/` directory:

```text
family-emergency-binder/
├── family-emergency-binder.html
├── assets/
└── templates/
    ├── emergency-contact-card.json
    └── my-templates/
        └── household-utilities.json
```

Keep the complete release folder together. Close and reopen the HTML file after adding or changing templates, then select the `templates/` directory again. The app reads templates but does not modify them.

Repository contributors add templates under:

```text
definitions/templates/<templateId>/v<version>.json
```

For repository templates, the directory name must match `templateId`. For example, version `1.0.0` of `emergency-contact-card` belongs at `definitions/templates/emergency-contact-card/v1.0.0.json`.

## Complete minimal example

All example values must be obviously fictional. Do not put real family information in a template file.

```json
{
  "templateId": "emergency-contact-card",
  "version": "1.0.0",
  "name": "Emergency contact card",
  "description": "A printable summary of one fictional emergency contact.",
  "page": {
    "size": "A4",
    "marginsMm": [14, 11, 14, 11]
  },
  "fields": {
    "contactName": {
      "label": "Contact name",
      "type": "string",
      "required": true,
      "minLength": 1,
      "maxLength": 120,
      "placeholder": "Enter a contact name",
      "example": "Alex Example"
    },
    "relationship": {
      "label": "Relationship",
      "type": "string",
      "required": true,
      "enum": ["Parent", "Sibling", "Friend", "Other"],
      "input": "enum",
      "example": "Friend"
    },
    "phoneNumber": {
      "label": "Phone number",
      "type": "string",
      "required": true,
      "input": "phone",
      "maxLength": 40,
      "example": "+1 555 010 0200"
    },
    "primaryContact": {
      "label": "Primary contact",
      "type": "boolean",
      "input": "boolean",
      "example": true
    }
  },
  "layout": [
    {
      "type": "title",
      "text": "EMERGENCY CONTACT"
    },
    {
      "type": "subtitle",
      "text": "For family reference"
    },
    {
      "type": "section",
      "title": "CONTACT DETAILS",
      "fields": ["contactName", "relationship", "phoneNumber", "primaryContact"]
    }
  ],
  "footer": "Generated {{system.generatedAt}} · Document revision {{system.documentRevision}}"
}
```

## Top-level properties

Templates reject unsupported properties. Use only the following keys.

| Property | Required | Meaning |
| --- | --- | --- |
| `templateId` | Yes | Stable lowercase kebab-case identifier, such as `emergency-contact-card`, up to 200 characters. |
| `version` | Yes | Exact semantic version with three numeric components, such as `1.0.0`, up to 50 characters. |
| `name` | Yes | User-facing name, up to 160 characters. |
| `description` | Yes | User-facing purpose, up to 600 characters. |
| `page` | No | PDF page size and margins. Defaults to A4 with `[14, 11, 14, 11]` millimetre margins. |
| `fields` | Yes | Object containing between 1 and 256 field definitions. |
| `layout` | Yes | Ordered array containing between 1 and 512 PDF layout nodes. |
| `footer` | No | Footer text, up to 2,000 characters. It may contain supported bindings in double braces. |

`page.size` is a PDFMake page-size name up to 20 characters; use `A4` unless you have tested another supported size. `page.marginsMm` must contain four numbers in the order `[left, top, right, bottom]`, each from 0 through 100.

## Field definitions

Field IDs are case-sensitive and must start with an ASCII letter followed only by ASCII letters or digits, for example `policyNumber` or `phone2`. Hyphens, spaces, underscores, and periods are not allowed in field IDs.

Every field requires:

- `label`: non-empty user-facing text, up to 160 characters.
- `type`: `string`, `number`, or `boolean`.
- `example`: fictional preview data whose JSON type exactly matches `type`.

Optional field properties:

| Property | Allowed values or behavior |
| --- | --- |
| `required` | Boolean. If true, a value must be supplied. |
| `input` | `text`, `number`, `boolean`, `enum`, `date`, `money`, `phone`, `email`, `url`, `secret`, or `multiline`. |
| `formatter` | `date`, `money`, `masked`, or `multiline`; controls PDF display. |
| `placeholder` | Input hint up to 300 characters. Do not use real data. |
| `format` | `date`, `email`, or `uri`; validates non-empty string values. |
| `enum` | Between 1 and 100 string choices, each up to 160 characters. Normally paired with `type: "string"` and `input: "enum"`. |
| `minLength` / `maxLength` | String-length limits from 0 through 1,000,000. The minimum cannot exceed the maximum. |
| `minimum` / `maximum` | Numeric limits from 0 through 1,000,000. The minimum cannot exceed the maximum. |

If `input` is omitted, the app infers `boolean` for booleans, `enum` when choices exist, `date` for the date format, `number` for numbers, and `text` otherwise.

Formatter behavior:

- `date` produces an India-locale date in the generated PDF.
- `money` produces an INR currency value.
- `masked` hides all but the last four characters.
- `multiline` preserves a multiline presentation.
- Booleans render as **Yes** or **No** without a formatter.

## Layout nodes

Layout nodes appear in PDF order. Each object must contain exactly the properties supported by its node type.

### Title and subtitle

```json
{ "type": "title", "text": "HOUSEHOLD UTILITIES" }
```

```json
{ "type": "subtitle", "text": "For family reference" }
```

Both require `text` of up to 2,000 characters. Text may include a supported binding such as `{{system.generatedAt}}`.

### Section

```json
{
  "type": "section",
  "title": "CONTACT DETAILS",
  "fields": ["contactName", "phoneNumber"]
}
```

A section renders each field as a label/value row and also creates the corresponding form fields in the browser. Its `title` may contain up to 200 characters and `fields` must contain between 1 and 256 field IDs.

### Paired table

```json
{
  "type": "pairedTable",
  "title": "SERVICE CONTACTS",
  "columns": ["Provider", "Phone"],
  "rows": [
    { "left": "electricityProvider", "right": "electricityPhone" },
    { "left": "waterProvider", "right": "waterPhone" }
  ]
}
```

The title may contain up to 200 characters. `columns` must contain exactly two headings of up to 160 characters each. `rows` must contain between 1 and 256 objects, each with exactly `left` and `right` field IDs.

### Text

Use literal text:

```json
{ "type": "text", "text": "Review this information every six months.", "style": "note" }
```

Or render a binding:

```json
{
  "type": "text",
  "value": "document.reviewDate",
  "formatter": "date",
  "when": "document.reviewDate"
}
```

A text node requires `text` or `value`. Literal `text` may contain up to 4,000 characters. A `value` or `when` binding may contain up to 240 characters. The optional `style` currently accepts only `note`. The optional `formatter` uses the same formatter list as fields. The optional `when` binding hides the node when the resolved value is empty or false.

### Spacer and page break

```json
{ "type": "spacer", "height": 8 }
```

`height` must be from 0 through 1,000.

```json
{ "type": "pageBreak" }
```

A page break accepts no additional properties.

## Field binding rules

Every declared field must appear exactly once in the `fields` of a `section` or as one side of a `pairedTable` row. Missing fields, repeated fields, and references to undeclared fields make the template invalid.

Bindings used by `value` and `when` may reference:

- A declared field as `document.<fieldId>`.
- `system.generatedAt`.
- `system.documentRevision`.
- `system.profileRevision`.

The same paths can be interpolated into title, subtitle, text, and footer strings with double braces, for example `{{document.contactName}}` or `{{system.generatedAt}}`.

## Versioning and duplicates

Treat a published `templateId` and `version` pair as immutable. When labels, validation, fields, layout, or meaning changes, copy the template to a new semantic version rather than overwriting the old version.

If the selected folder contains multiple valid files with the same `templateId` and `version`, the app chooses the file with the newest modification time. Relative path is the deterministic tie-breaker. Reusing a version can therefore change how matching documents behave.

Documents store an encrypted compiled template snapshot and content hash. That snapshot remains available when the selected template catalog no longer includes the original version.

## Safety and size limits

- Templates are JSON data only. They cannot execute JavaScript, HTML, macros, or commands.
- Remote URLs and runtime asset paths are not supported by the template format.
- A selection may contain at most 256 JSON files.
- Each JSON file must be between 1 byte and 512 KiB.
- Selected JSON files may total at most 16 MiB.
- Paths may be at most 12 levels deep.
- Unknown properties are rejected rather than ignored.
- Examples, documentation, previews, and tests must use obviously fictional information.
- Never place passwords, recovery keys, real account details, or other family information in a template.

## Validate a template

1. Confirm that the file is valid JSON with no comments or trailing commas.
2. Put it under the extracted release's `templates/` directory.
3. Close and reopen `family-emergency-binder.html`.
4. Select the `templates/` directory.
5. Review any folder diagnostics on the Templates page.
6. Preview the template and confirm that its fictional example data produces a readable PDF.
7. Create a test document with fictional values and exercise required fields, formats, enum choices, and numeric limits.
8. Generate a password-protected PDF and inspect its layout, page breaks, masking, and footer.
9. Increment the semantic version before distributing a meaningful revision.

Repository contributors must also run:

```text
pnpm templates:prepare
pnpm test:client
```

## AI prompt

Copy the following prompt and replace the bracketed description. Give the AI this guide or a link to it as context.

```text
Create one Family Emergency Binder Creator JSON template for:

[DESCRIBE THE DOCUMENT AND THE INFORMATION IT SHOULD COLLECT]

Return only one valid JSON object, with no Markdown fence or explanation.

Requirements:
- Use only the template properties, field properties, input types, formatters,
  layout nodes, and bindings documented in the supplied custom-template guide.
- Use a lowercase kebab-case templateId and semantic version 1.0.0.
- Use only string, number, and boolean field types.
- Give every field a label, matching fictional example value, and sensible
  validation. Never use real people, organizations, accounts, addresses,
  phone numbers, credentials, recovery keys, or policy details.
- Put every declared field exactly once in a section or pairedTable.
- Do not reference undeclared fields.
- Do not add code, HTML, macros, remote assets, URLs for loading content,
  comments, trailing commas, or undocumented properties.
- Use A4 pages unless the requested document clearly needs another tested size.
- Keep the printable layout concise and readable.
- Add a footer using system.generatedAt and system.documentRevision.
- Before responding, check that the JSON parses and that every example value
  has exactly the same JSON type as its field.
```

Treat AI-generated output as an untrusted draft. Review every field and validation rule, then follow the complete validation process before using or sharing it.
