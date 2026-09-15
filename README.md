# Family Emergency Binder Creator

A private, browser-only application for creating encrypted family emergency binder records and password-protected PDFs. The distributable is one HTML file; recipients do not need Docker, Node.js, a server, an installation, or an internet connection.

## Use the application

1. Build the distributable with `pnpm install && pnpm build`, then open `dist/family-emergency-binder.html`.
2. Double-click it and open it in a current desktop browser. Chrome, Edge, or another Chromium browser is recommended.
3. Choose **Open vault** and select a `.febvault`, or choose **Create vault** and save a new one anywhere on a hard disk or removable drive.
4. Enter the single vault password, then choose a profile.
5. Wait for the persistent status to say **Saved** before locking the vault, closing the browser, copying the file, or ejecting a removable drive.

Chrome, Edge, and compatible Chromium browsers update the selected vault in place. Firefox and Safari run in compatibility mode because they do not expose equivalent user-visible writable file handles: they open a vault through a standard file chooser and download a new encrypted copy after the user selects **Download updated vault**. Compatibility mode shows a persistent warning, blocks locking while a newer copy is required, and warns before closing. Always keep the newest download. The application asks the user to choose a vault on every start and never stores a file handle in browser storage.

## Vaults and backups

A `.febvault` is a portable, encrypted JSON envelope. One password unlocks every profile in that file. Profile names, document labels, field values, immutable revisions, and pinned template snapshots are encrypted together with AES-256-GCM. PBKDF2-HMAC-SHA-256 with at least 600,000 iterations derives the password wrapping key. A separately stored 256-bit recovery key can replace a forgotten password.

In Chromium mode, every explicit mutation is written to the selected file before the UI reports success. In Firefox/Safari compatibility mode, mutations update the encrypted in-memory generation and show **Download required** until a new `.febvault` has been downloaded. The app does not try to save during browser close. A failed or externally conflicting direct write is reported and never shown as saved. Do not open the same vault in two app windows.

Use **Save vault copy** in Chromium, or **Download updated vault** in compatibility mode, to create another complete `.febvault`. A single working file is not, by itself, a backup; keep a separate copy and keep the recovery key away from both copies.

Generated PDFs are saved directly through a browser Save dialog. Each PDF uses a separate password supplied at generation time. The app deliberately keeps no generated-PDF history or PDF bytes in the vault.

## Development

Development requires Node.js 24.21 or later and pnpm 10.11. End users do not need either.

```text
pnpm install
pnpm dev
pnpm test
pnpm build
```

`pnpm build` emits exactly:

```text
dist/family-emergency-binder.html
```

The build inlines the React application, styles, browser worker, templates, thumbnails, Noto Sans fonts, and PDF engine. Source templates remain under `definitions/templates/<templateId>/<version>.json`; published versions are immutable and examples must be obviously fictional.

The root `package.json` is the application-version source of truth. The build output under `dist/` is generated and gitignored; do not commit it. A packaged `.zip` distribution containing the HTML and template assets is planned; the stable `family-emergency-binder.html` filename is preserved for it.

Before release, run:

```text
pnpm security:repo-check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## Security boundary

Encryption protects a closed vault file or a copied/removable drive. It cannot protect an unlocked vault from the operating system, malware, browser extensions, screenshots, swap, a privileged user, or a modified copy of the application HTML. Treat both the browser and the HTML file as trusted. The application contains no telemetry or remote assets and its production Content Security Policy disables network connections.

There is no migration from the earlier SQLite `.febcvault` proof-of-concept format.
