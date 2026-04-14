# Child Task: Backend Super-Admin System Settings Foundation

## Goal

Replace the org-owner gate on system settings with a real super-admin-only contract, and add the minimal backend support needed for the new global system settings console to rely on that boundary truthfully.

## Scope

- Add a backend dependency that enforces `is_super_admin`.
- Switch `/system/settings/*` to that dependency.
- Expose any small schema/runtime adjustments needed for the frontend shell to gate and label itself correctly.

## Success Criteria

- Non-super-admin authenticated users cannot use `/system/settings/*`.
- Existing super-admin bootstrap truth remains the source of authority.
- No compatibility path remains that still treats org owner as sufficient for system settings.

## Risks

- Some existing internal calls may assume org-owner access and could regress if the dependency is swapped blindly.
- Future `/system/*` surfaces may need different authority levels, so the new dependency should stay narrowly named and composable.
