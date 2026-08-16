# Centralize language catalog metadata in System Settings

**Status:** accepted

System Settings will own the deployment's supported-language catalog: locale code, localized display names, native name, country/region flag code, enabled state, default language, and ordering. Platform surfaces will read this catalog through a shared configuration interface instead of hard-coding the language list. Translation content remains versioned and validated resource bundles; System Settings is not an arbitrary translation-key editor.

**Consequences**

- Locale switching and language menus must consume the server-backed catalog while preserving an explicit no-fallback error contract.
- The catalog needs revisioning, validation, cache invalidation, and a safe bootstrap path before authentication.
- Flag icons use a reviewed country/region icon package or asset set; language identity remains distinct from country identity in copy and accessibility labels.
