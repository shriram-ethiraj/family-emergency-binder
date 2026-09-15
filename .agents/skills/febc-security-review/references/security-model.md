# Security model

## Boundary and assets

- The supported deployment is one trusted, self-contained HTML file opened in a current desktop browser by a single user. Chromium provides direct-save mode; Firefox and Safari use an explicit encrypted-download compatibility mode because they lack equivalent user-visible writable handles.
- The application HTML, browser, extensions, operating system, and privileged host users are trusted while a vault is unlocked.
- Sensitive assets are vault/profile passwords, recovery keys, the vault data key, profile identities, document labels and revisions, pinned template snapshots, and generated PDFs.
- A `.febvault` exposes only its magic/version, random vault ID, save generation, bounded KDF parameters, nonces, and ciphertext lengths. All user-entered and organizational data is inside one authenticated ciphertext.
- The app does not protect unlocked values from malware, browser extensions, screenshots, swap, a modified HTML artifact, or a privileged host user.

## Controls

- PBKDF2-HMAC-SHA-256 with a random 128-bit salt and at least 600,000 iterations derives a password wrapping key. A random 256-bit recovery secret derives an independent wrapping key with HKDF-SHA-256.
- A random 256-bit vault data key is wrapped independently by password and recovery keys. AES-256-GCM encrypts the complete payload; AAD binds format, vault ID, purpose, KDF parameters, and save generation. Every encryption uses a fresh random 96-bit nonce.
- The password is discarded after derivation. The unlocked worker retains a non-extractable `CryptoKey`; temporary raw keys are overwritten on a best-effort basis. JavaScript cannot guarantee removal of every runtime copy.
- File input, KDF parameters, decoded payloads, schemas, and sizes are bounded and validated before use. Wrong-password and authenticated-data failures do not disclose separate oracles.
- Every explicit domain mutation is serialized and encrypted. Direct-save mode checks the last file hash and completes the writable-handle write before reporting success. Compatibility mode marks the vault dirty, blocks locking, warns on close, and requires the user to download the newest encrypted generation. Concurrent editing remains unsupported.
- Locking clears the worker key/state, selected handle, recovery key, active profile, and sensitive UI/query caches. Inactivity locks after 30 minutes.
- The production artifact has no API calls or remote assets. Its meta Content Security Policy disables networking, permits only hash-pinned application scripts and embedded data/blob resources, and allows inline CSS because browser UI libraries require runtime positioning styles.
- PDFs require a separate confirmed password and are saved directly to a user-selected file. The app keeps no PDF bytes, password, path, or receipt.

## Review checklist

- Check for plaintext in the outer envelope, logs, errors, URLs, browser persistence, filenames, previews, fixtures, and tests.
- Check KDF floors/ceilings, random nonces and salts, stable AAD, authenticated failure behavior, key lifetime, recovery/password rewraps, and tamper rejection.
- Check picker user activation, external-change detection, serialized saves, failure reporting, removable-drive behavior, save-copy semantics, and clean lock handling.
- Check templates for remote/executable content and PDFs for accidental unencrypted values or reuse of the vault password.
- Verify the production build emits exactly `dist/family-emergency-binder.html` with no external resource or network dependency.
- Run `pnpm security:repo-check`, dependency review, typecheck, lint, tests, build, and end-to-end checks before release.
