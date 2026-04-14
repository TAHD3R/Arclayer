# Super Admin System Settings Epic

## Goal

- Ship a production-ready global `System Settings` console for super admins, covering the hard permission boundary, global routing/navigation, a ChromeTabs-based IA, the first real editable operator domains for storage, email, and OAuth/access policy, and the first hard-cut cleanup of the API env/runtime settings contract that backs those domains.

## Non-Goals

- Do not fully complete every future settings domain in one rollout.
- Do not preserve the old org-owner access model for `/system/settings/*`.
- Do not fully complete every remaining config/runtime simplification concern in one slice.
- Do not keep the old storage `public_base_url / upload policy` operator IA alive just for compatibility.

## Constraints

- Must keep the diff aligned with existing admin/global shell patterns and FastAPI service/router layering.
- Must not introduce silent fallbacks or placeholder success states.
- Must keep unrelated dirty files untouched.

## Risk Assessment

- Global-scene path matching is centralized; a partial route update can misplace the new screen into the wrong layout.
- Existing system settings APIs are real but currently guarded by org-owner, so permission changes must be explicit and verified.
- The current settings payload is still centered on `core`; deeper namespace refactors should not destabilize existing runtime consumers while the editable UI expands.
- OAuth and public registration rules already have live backend consumers, so schema cleanup must follow real field names instead of inventing a parallel contract.
- The API env contract currently carries historical aliases and dead example keys; cleanup must stay compatible with the live canonical keys while exposing any unrelated drift honestly.

## Child Deliverables

- Backend foundation: super-admin-only system settings contract
- Admin shell integration: global route/menu/guard wiring
- System settings UI shell and first domain views
- Focused verification and task artifact reconciliation
- IA refresh: replace the mini side rail with ChromeTabs and extend system routing for OAuth
- Core schema cleanup: editable storage/email/oauth/auth/notifications slices
- Real editing: storage/email/oauth pages with truthful patch flows
- Phase-2 focused validation and artifact reconciliation
- Canonical API env contract cleanup for `config.py` and the moved env settings sections
- Phase-3 focused validation and artifact reconciliation

## Dependency Notes

- Child 2 depends on child 1 because frontend visibility and route affordances should match real backend authority.
- Child 3 depends on child 2 because the shell needs settled route/menu contracts.
- Child 4 depends on 1;2;3.

## Child Task Types

- `single-full`

## Done-When

- [ ] Every row in `SUBTASKS.csv` is `DONE`
- [ ] Focused admin/api verification passes
- [ ] The new system settings path is reachable only by super admins
- [ ] The system console exposes real edit flows for storage, email, and OAuth/access policy
- [ ] The API env/runtime settings contract uses canonical nested env names without the old merge workaround
