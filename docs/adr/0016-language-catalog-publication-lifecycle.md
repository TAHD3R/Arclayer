# Publish Language Catalog changes explicitly

**Status:** accepted

Language Catalog changes will use a draft, impact-review, and publish lifecycle. Publishing a revision updates supported/enabled languages, default locale, ordering, and flag metadata through an explicit server-confirmed change; disabling a current/default locale requires a replacement choice and never silently falls back in the client.

**Consequences**

- The catalog needs revision-bound validation, impact projections, idempotency, Audit evidence, and cache invalidation.
- Locale menus and language-aware pages must represent disabled or unavailable current preferences explicitly.
- A catalog draft can be saved without changing runtime language availability until published.
