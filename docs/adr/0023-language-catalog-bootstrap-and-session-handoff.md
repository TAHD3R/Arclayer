# Bootstrap Platform languages before authentication, then hand off to System Settings

**Status:** accepted

Unauthenticated Platform pages use a minimal built-in `zh-CN`/`en-US` catalog so sign-in, MFA, setup, and error recovery never depend on a protected System Settings read. After a Platform Session is established, the console fetches the server-backed Language Catalog projection and treats it as authoritative for enabled state, default, order, labels, and flags; disabled current locales require explicit reselection and never silently fall back.

**Consequences**

- The public bootstrap projection must be safe, small, and independent of operator permissions.
- Authenticated pages need a visible unavailable/conflict state when the catalog cannot be loaded or changes during a session.
- The Platform-first rollout does not change Product Application language bootstrap.
