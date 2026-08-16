# Plan copy is authored as localized product text

**Status:** accepted

Plan editors will enter localized product copy directly (at minimum `zh-CN` and `en-US` names and descriptions) instead of exposing `nameI18NKey` or `descriptionI18NKey` as operator-facing fields. The Platform API may retain stable references internally, but the Console presents and validates human-readable localized content.

**Consequences**

- Plan forms need explicit locale tabs/sections, placeholders, validation, and preview.
- Existing key-only catalog contracts must be adapted or extended without leaking translation implementation details into the primary UI.
- Published Revision copy remains part of the immutable commercial snapshot.
