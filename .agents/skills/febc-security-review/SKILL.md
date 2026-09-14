---
name: febc-security-review
description: Review or harden Family Emergency Binder Creator authentication, cryptography, vault storage, sensitive-data handling, template isolation, filesystem writes, or protected PDFs. Use for security-sensitive changes; do not activate for ordinary copy or styling work.
---

# FEBC security review

Use this skill for explicit security work and changes that cross a security boundary.

1. Read [references/security-model.md](references/security-model.md) before broad scanning.
2. State the affected asset, trust boundary, attacker capability, and failure impact.
3. Trace untrusted input to storage, cryptographic operations, filesystem paths, templates, or output before proposing a change.
4. Preserve authenticated encryption, KDF and AAD binding, CSRF/host/origin checks, rate limits, session cleanup, atomic writes, restrictive permissions, and local-only assets unless the user explicitly changes the threat model.
5. Add a regression test for a fixed vulnerability or changed invariant and run the security-sensitive verification in the root `AGENTS.md`.

Do not claim independent audit, absolute security, or protection outside the documented boundary. Explicit user requirements take precedence when they knowingly redefine product behavior; call out any resulting threat-model change. Update the reference when security architecture changes.
