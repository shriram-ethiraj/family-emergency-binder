# Family Emergency Binder Creator

A private, browser-only application for creating encrypted family emergency binder records and password-protected PDFs. The distributable is a portable folder; recipients do not need Docker, Node.js, a server, an installation, or an internet connection.

## Use the application

1. Build with `pnpm install && pnpm build`, or extract a release ZIP without moving files out of its root folder.
2. Open `family-emergency-binder.html` in a current desktop browser.
3. Choose the adjacent `templates` folder. The app validates its JSON files and keeps them in memory for this page session only.
4. Open a `.febvault`, or create and save a new one, then enter the vault password.
5. Choose or create a profile after both setup steps are complete.
6. Wait for the persistent status to say **Saved** before locking, closing the browser, copying the vault, or ejecting a removable drive.

Refreshing or closing the page clears both the selected template files and the unlocked vault. Choose the template folder and vault again on the next page session. To add a template, place its JSON file directly or in a subfolder under `templates/`, then reopen the app and select that folder. The app never modifies template files.

Chrome, Edge, and compatible Chromium browsers update the selected vault in place. Firefox and Safari use compatibility mode: they open a vault through a standard file chooser and download a new encrypted copy after each set of changes. Always keep the newest download.

## Vaults and backups

A `.febvault` is a portable, encrypted JSON envelope. One password unlocks every profile in that file. Profile names, document labels, field values, immutable revisions, and fallback template snapshots are encrypted together with AES-256-GCM. PBKDF2-HMAC-SHA-256 with at least 600,000 iterations derives the password wrapping key. A separately stored 256-bit recovery key can replace a forgotten password.

Generated PDFs are saved directly through a browser Save dialog and use a separately confirmed PDF password. The app keeps no generated-PDF history or PDF bytes in the vault.

## Development and packaging

Development requires Node.js 24.21 or later and pnpm 10.11. End users do not need either.

```text
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm package
```

`pnpm build` emits:

```text
dist/family-emergency-binder/
├── family-emergency-binder.html
├── assets/
├── templates/
└── README.txt
```

The HTML contains the React application, styles, and browser worker. Fixed PDFMake, Noto Sans, and Geist resources live under `assets/`; source templates are copied from `definitions/templates` to `templates`. `pnpm package` also creates a versioned ZIP and SHA-256 checksum while enforcing the 1.25 MiB HTML and 2.5 MiB ZIP budgets.

Template IDs use lowercase kebab-case and versions use semantic versioning. If multiple valid files declare the same ID/version, the newest filesystem modification time wins, with relative path as the tie-breaker. Reuse of a version can affect matching documents, so prefer a new version for meaningful edits. Repository examples must remain obviously fictional.

Before release, run:

```text
pnpm security:repo-check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Pushing a `v*` tag matching `package.json` runs release verification and publishes the ZIP plus checksum to GitHub Releases.

## Security boundary

Encryption protects a closed vault file or copied/removable drive. It cannot protect an unlocked vault from the operating system, malware, browser extensions, screenshots, swap, a privileged user, or modified application assets. Treat the extracted HTML and fixed `assets/` directory as trusted. Selected template JSON is treated as untrusted, bounded data and cannot execute code or load remote assets. The production Content Security Policy disables networking.
