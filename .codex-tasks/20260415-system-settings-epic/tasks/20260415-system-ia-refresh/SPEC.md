# Child Task: System Settings IA Refresh to ChromeTabs

## Goal

Replace the rejected mini side rail with a ChromeTabs-based navigation model and extend the system settings route graph with the OAuth domain.

## Scope

- Replace `MiniCategoryNav` in `SystemSettingsShell` with `ChromeTabs`
- Add `/system/oauth`
- Keep the global-scene + super-admin-only contract intact

## Success Criteria

- `/system` uses ChromeTabs for navigation
- `/system/oauth` exists with a title key
- Existing global-nav and route identity behavior stays green
