# Family Emergency Binder Creator security notes

Do not open a public issue containing a real `.febvault`, recovery key, vault or PDF password, generated PDF, or personal record value.

The supported boundary is a single-user, offline HTML application in a current desktop browser. Chromium provides direct in-place saves; Firefox and Safari use a clearly labeled encrypted-download compatibility mode. AES-256-GCM protects the authenticated vault contents at rest. The application HTML, browser, browser extensions, operating system, and privileged host users are trusted while a vault is unlocked.

Keep the recovery key separately from the password and every vault copy. In Chromium, wait for **Saved** before closing or ejecting storage. In compatibility mode, use **Download updated vault** whenever shown and retain the newest download. Never edit one vault concurrently from multiple app windows.

Before publishing changes, run `pnpm security:repo-check`, typecheck, lint, tests, the production build, and dependency review. Never add real family data to definitions, fixtures, screenshots, logs, documentation, or issue reports.
