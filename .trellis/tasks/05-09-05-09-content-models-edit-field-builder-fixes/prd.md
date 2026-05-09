# brainstorm: content models edit field builder fixes

## Goal

Improve `/content/models/edit` for Headless CMS content model editing by fixing field creation/editing UX defects, removing table interactions that are currently misleading, and restructuring the model settings surface into clearer sections.

## What I already know

- User reported the field type picker first step mostly works, but its four field-type group columns currently have inconsistent heights.
- User reported the second field configuration step lacks placeholders in basic and advanced settings.
- User reported advanced settings currently overuse plain input fields; `RegExp 模式` should be renamed to `正则表达式`, and validation-related controls such as regex, min/max length, conditions, and related controls need more appropriate UI.
- User reported switching between Advanced and Basic currently triggers save/validation and closes the dialog during edit; correct behavior is that only the dialog footer Add/Save action persists.
- User requested removing the localizable/localization column from the fields table.
- User requested removing the field key description text: `API 字段标识符，使用 camelCase，创建后不建议修改。`
- User reported field drag-and-drop does not work.
- User requested removing field table multi-select and the multi-select toolbar.
- User requested adding a `Name and description` edit section and a `JSON Preview` section to `/content/models/edit`.
- User requested analyzing the existing Settings section, removing duplicated/useless settings, and splitting true content model core settings from related feature settings.
- User requested the settings-page treatment in 2.3 to reuse `/system/settings/access` page configuration components and styles.
- User confirmed Workflow must remain as an independent editable section, but implemented with standard and suitable components and with repeated/tedious settings removed.
- User provided Strapi screenshots for field conditions: a `Condition` setting can be applied only when boolean or enumeration fields are available, and should show an explicit unavailable message when no eligible fields exist.
- User clarified that type-specific configuration matters: default value, min/max values, the five Settings toggles (`required`, `unique`, `localizable`, `hiddenInEditor`, `omitFromApiResponse`), conditions, and basic field settings must be shown according to the selected field type rather than displaying everything for every type.
- User later clarified the field configuration matrix must be complete for every built-in field type, not a partial Strapi-like surface. The required flow is: first align against local `references/strapi`, then review official Contentful developer documentation and use its validation matrix as reinforcement.

## Repo Facts

- Main edit screen is `apps/admin/src/pages/projects/content/models/components/content-model-edit-screen.tsx`.
- Existing edit sections are typed as `ContentModelEditSectionKey = "fields" | "settings"`.
- Existing field config sections are typed as `FieldConfigSectionKey = "basic" | "advanced"`.
- Field type groups are rendered in `FieldTypePickerDialog` using `CONTENT_MODEL_FIELD_TYPE_GROUPS`; current layout is `grid gap-4 md:grid-cols-2 xl:grid-cols-4`.
- Built-in field type ids in `apps/admin/src/pages/projects/content/models/fields.ts`: `rich_text`, `short_text`, `markdown`, `slug`, `email`, `password`, `number`, `decimal`, `biginteger`, `enumeration`, `date_time`, `time`, `date`, `media`, `location`, `boolean`, `json_object`, `reference`, `component`, `dynamic_zone`, `blocks`. There is also `custom`.
- `reference` and `component` target model controls currently use raw browser `<select>` in `content-model-edit-screen.tsx`.
- Shared select component exists at `packages/ui/src/select.tsx` and handles select portal placement inside dialogs.
- Fields table currently defines a `localization` column whose cell renders `null`.
- Fields table currently enables row selection via `rowSelection.enabled: true`, toggles selection on single row click, and renders a selected-fields toolbar with bulk hide/omit actions.
- Fields table current DnD is handwritten on the label cell and drag handle using DOM drag events.
- JSON preview API already exists on the frontend as `getContentModelJsonPreview(projectId, modelId)` in `apps/admin/src/api/content.ts`.
- Backend route exists at `GET /models/{model_id}/json-preview` in `apps/api/src/modules/projects/content/models/router.py`.
- Current `ContentModelSettingsTab` combines `capabilities`, `workflow`, and `routing` into one settings tab.
- `/system/settings/access` uses `SystemSettingStack`, `SystemSettingItem`, `SystemSettingRow`, `SystemSettingField`, and `SystemSettingFooterActions` from `apps/admin/src/pages/system/components/system-setting-item.tsx`.
- Backend/OpenAPI workflow contract supports the fixed editorial stages `drafting`, `in_review`, `changes_requested`, `approved`; model workflow patch includes `initialStage`, `publishStage`, `transitions`, `stageAssignments`, and `stagePermissions`.
- Current field condition storage is `field.config.condition` as a string; no richer content-field condition editor currently exists in this repo.
- Local Strapi reference checkout exists under `references/strapi`; relevant inspected files include `packages/core/content-manager/admin/src/components/ConfigurationForm/EditFieldForm.tsx`, `Fields.tsx`, and `utils/conditionalFields.ts`.
- Strapi's configuration form filters editable field settings by attribute type instead of rendering every possible setting for every field type.

## Assumptions

- This task is admin frontend only unless JSON preview or model patch contracts reveal missing backend capability.
- We should keep localization keys in `@locales/zh-CN/content.json` and `@locales/en-US/content.json`; no hardcoded user-facing copy.
- The 21 built-in field types must each have explicit matrix coverage. Variant types that are reached through a parent picker card, such as `decimal`, `biginteger`, `date`, and `time`, still count as independent field type ids and need their own evidence.

## Requirements

- Field type picker group cards should have consistent visual height across the four columns.
- Field config dialog must not save or validate when switching between Basic and Advanced.
- Basic and Advanced fields should include useful placeholders where free text input remains.
- `RegExp 模式` copy should become `正则表达式` in zh-CN, with matching English copy as appropriate.
- Replace raw `<select>` controls in the field config dialog with `@arclayer/ui/select`.
- Review field type-specific controls and replace plain inputs where a more structured UI is appropriate.
- Remove the field key description text from the add/edit field dialog.
- Remove localizable/localization column from fields table.
- Remove fields table multi-select and selected-items toolbar.
- Fix field DnD reorder behavior.
- Add edit side-menu sections for model name/description and JSON preview.
- Restructure settings using system-settings-style components and save/reset footer behavior.
- Analyze current settings and avoid keeping duplicate or unusable controls in the rebuilt surface.
- Keep Workflow as an independent editable section.
- Workflow should use standard components: for example, `@arclayer/ui/select` for stage choices and structured checkbox/toggle controls for transitions/role rules.
- Workflow UI should remove duplicated/tedious settings from the current implementation. The implementation should prefer role-based assignment/permission controls over raw comma-separated user-id text inputs unless a concrete contract requirement makes user IDs necessary.
- Add a `Settings` title above the five advanced boolean setting cards (`required`, `unique`, `localizable`, `hiddenInEditor`, `omitFromApiResponse`).
- Field condition UI should follow the Strapi-style interaction: show a Condition block, only allow applying a condition when another boolean or enumeration field exists, and present a clear disabled/unavailable state otherwise.
- Condition editor should target another eligible field and one of its allowed values; it should not be a raw text/JSON input in the primary UI.
- Field configuration UI must be type-aware. Each selected field type should only show settings that make sense for that type.
- Field configuration behavior must be captured in a prompt-to-artifact matrix that maps every built-in field type to:
  - its Strapi reference controls,
  - relevant Contentful validation primitives,
  - current Arclayer backend-supported config keys,
  - Admin UI controls,
  - payload keys,
  - and tests proving the row.
- Any Strapi or Contentful capability that is not implemented must be recorded as a gap with a concrete reason, not silently omitted.
- Default value controls should be type-aware, not a universal text input.
- Min/max controls should only appear for field types that support numeric or length bounds.
- Basic field settings should also be type-aware; for example, relation/component/dynamic-zone targets are specific controls and should not imply unrelated text validation controls.

## Open Questions

- Confirm after research whether the condition payload should remain a string-compatible value in `config.condition` or move to a structured JSON value under the same config key.

## Acceptance Criteria

- [ ] Switching Basic/Advanced in the field config dialog never calls add/update field mutation and never closes the dialog.
- [ ] Field type picker columns/cards render with consistent heights.
- [ ] Field config placeholder coverage is added for free-text fields.
- [ ] Reference and component target selectors use `@arclayer/ui/select`.
- [ ] Field table no longer shows localization column, row selection, or the bulk toolbar.
- [ ] Field reorder works through a tested drag/drop or accessible reorder interaction.
- [ ] Model name/description can be edited from a dedicated section.
- [ ] JSON Preview section loads and displays `getContentModelJsonPreview`.
- [ ] Settings are split into clear sections and use the same component/style pattern as `/system/settings/access`.
- [ ] Workflow remains editable as its own section and no longer presents duplicated or tedious controls as the primary interaction.
- [ ] Advanced field settings include a `Settings` title before the five boolean setting cards.
- [ ] Condition editor uses eligible boolean/enumeration fields and shows an unavailable state when none exist.
- [ ] Each built-in field type only exposes applicable basic/advanced settings.
- [ ] Every built-in field type id has matrix evidence, including variant-only ids: `decimal`, `biginteger`, `date`, and `time`.
- [ ] Contentful validation primitives have been reviewed and mapped to Arclayer support/gap status.
- [ ] Admin tests cover the regression points above.
- [ ] `pnpm admin:check` passes, or any inability to run it is reported.

## Definition of Done

- Tests added/updated for affected UI behavior.
- Lint/typecheck pass for admin frontend.
- i18n resources updated for zh-CN and en-US.
- No silent fallback paths or fake success behavior introduced.

## Out of Scope

- Backend schema changes unless the existing frontend API is insufficient for requested UI.
- Full redesign of content model creation outside `/content/models/edit`.
- Full cross-browser manual matrix testing of all 21 built-in field types unless explicitly promoted into scope.

## Technical Notes

- Relevant specs to curate for implementation/check context: `.trellis/spec/admin/frontend/index.md`, `.trellis/spec/api/frontend/index.md`, `.trellis/spec/shared/schema-field-contracts.md`, `.trellis/spec/monorepo/index.md`.
- Relevant design docs: `DESIGN.md`, `docs/guidelines/frontend-design.md`.
