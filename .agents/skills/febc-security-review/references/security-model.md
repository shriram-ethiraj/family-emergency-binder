# Security model

## Boundary and assets

- The supported deployment is a single-user application bound to localhost. The OS and browser are trusted while a profile is unlocked.
- Sensitive assets are profile fields, document labels and revisions, receipt details, audit subjects, recovery keys, passwords, profile data keys, generated PDFs, and their private metadata.
- The single SQLite database exposes structural metadata by design: profile names, random IDs, template IDs and versions, revision and archive state, event types, and system timestamps. Every user-entered profile or template record is stored as an AES-256-GCM encrypted JSON blob; there are no template-field columns.
- The app does not protect unlocked values from malware, browser extensions, screenshots, swap, or a privileged host user.

## Controls

- Passwords are stretched with scrypt and used to unwrap a random profile data key. Recovery keys independently derive a wrapping key with HKDF-SHA-256.
- AES-GCM AAD binds key wraps and encrypted JSON records to the application namespace and format, profile, entity type, entity ID, and revision where applicable. A fresh random nonce is used for every encrypted write.
- Recovery keys exist only in server response and frontend memory. Locking clears the cookie, CSRF token, recovery key, and sensitive query data; server sessions expire after inactivity.
- Mutating routes require the in-memory session and matching CSRF header. Host and Origin checks restrict browser traffic to the active localhost origin; responses receive restrictive security headers.
- Unlock and sensitive operations are rate-limited; repeated password failures persist a temporary profile lockout.
- The portable vault uses one process-lifetime native SQLite connection with exclusive SQLite/OS locking, full synchronization, a truncate journal, foreign keys, secure deletion, serialized transactions, startup integrity checks, and restrictive best-effort permissions. SQLite locks are released by the OS after normal shutdown, crashes, or forced termination; no sentinel lock file is used.
- Docker Compose uses a network-disabled, one-shot storage initializer with narrowly scoped filesystem capabilities to normalize the dedicated vault, output, and template-cache mounts before starting the unprivileged, capability-free backend.
- Template assets must stay local and within allowed roots. Generated PDFs require password confirmation, use exclusive output creation, and record a SHA-256 receipt. Per the product's filename requirement, output filenames may expose sanitized lowercase template, profile, and document-label names, but never document field values.

## Review checklist

- Check whether new data is plaintext in the outer store, logs, errors, URLs, browser persistence, filenames, previews, cache files, or tests.
- Check authentication and authorization on every new route, including CSRF for mutations and session cleanup on failure.
- Check path normalization, traversal, symlinks, overwrite behavior, file modes, temporary cleanup, and concurrent writers.
- Check cryptographic nonce generation, label/AAD stability, key zeroing, error oracles, KDF bounds, tamper failure, and recovery behavior.
- Check template inputs for executable or remote content and PDFs for accidental unencrypted values or misleading protection claims.
- Run `pnpm security:repo-check`, production dependency audit, typecheck, lint, tests, and build before release.
