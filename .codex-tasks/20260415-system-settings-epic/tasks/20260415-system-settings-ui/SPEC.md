# Child Task: System Settings Console Shell and First Domain Views

## Goal

Land the first honest `System Settings` console in the global scene so super admins can navigate a real instance-level surface instead of a placeholder menu entry.

## Scope

- Add `/system` routes for overview, storage, and email under a shared shell.
- Guard the shell so only super admins can enter it.
- Reuse existing runtime and system-core APIs to render truthful, read-heavy domain summaries.
- Add i18n keys for the new console hierarchy and route titles.

## Success Criteria

- Super admins can open `/system`, `/system/storage`, and `/system/email`.
- Non-super-admin direct access results in a 403 view under the admin shell.
- The first domain pages only show data backed by real runtime/settings APIs.

## Risks

- Over-eager UI could drift into fake settings forms for domains that do not yet have stable backend contracts.
- Route-title and locale coverage can regress quietly if the new route files are added without matching i18n keys.
