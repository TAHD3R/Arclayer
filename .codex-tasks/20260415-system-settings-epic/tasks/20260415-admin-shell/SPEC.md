# Child Task: Admin Global Route, Menu, and Visibility Guard

## Goal

Expose `System Settings` as a real global-scene destination in the admin shell, while ensuring only super admins can discover that entry through navigation and command surfaces.

## Scope

- Add a current-user hook that exposes `isSuperAdmin` from `/auth/me`.
- Filter global navigation items through a single helper instead of hard-coded placeholders.
- Extend global-scene route identity so `/system/*` resolves under `GlobalLayout`.
- Add focused admin tests for menu filtering and route identity.

## Success Criteria

- Non-super-admin users do not see `System Settings` in the global sidebar or topbar-driven command scope.
- `/system`, `/system/storage`, and `/system/email` resolve inside the global scene.
- No disabled placeholder remains for the old global settings idea.

## Risks

- If menu filtering is not centralized, the topbar and sidebar can drift out of sync.
- If `/system/*` is not treated as global-scene routing truth, the new console will render under the wrong shell.
