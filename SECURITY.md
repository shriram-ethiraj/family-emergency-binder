# Family Emergency Binder Creator security notes

Do not open a public issue containing a real vault, recovery key, password, generated PDF, or personal record value.

The supported security boundary is a single-user localhost application. The encrypted database protects data at rest; the operating system and browser must be trusted while a profile is unlocked. Keep the recovery key separately from the password and pen drive.

Before publishing changes, run `pnpm security:repo-check`, the full test suite, and dependency review. Never add real family data to definitions, templates, fixtures, screenshots, or issue reports.
