# Content Model Field Configuration Matrix

Date: 2026-05-09

This artifact is the prompt-to-implementation checklist for the `/content/models/edit` field
configuration matrix. It treats Strapi as the primary local behavior reference and Contentful's
official validation model as reinforcement vocabulary.

## Sources

- Strapi local reference:
  - `references/strapi/packages/core/content-type-builder/admin/src/components/FormModal/attributes/baseForm.ts`
  - `references/strapi/packages/core/content-type-builder/admin/src/components/FormModal/attributes/advancedForm.ts`
  - `references/strapi/packages/core/content-type-builder/admin/src/components/FormModal/forms/forms.ts`
  - `references/strapi/packages/core/content-type-builder/admin/src/components/FormModal/attributes/ConditionForm.tsx`
  - `references/strapi/packages/core/content-type-builder/admin/src/utils/conditions.ts`
- Contentful official references:
  - `https://www.contentful.com/developers/docs/references/content-management-api/`
  - `https://www.contentful.com/help/fields/available-validations/`
  - `https://www.contentful.com/help/content-modelling-basics/`

## Matrix

| Field type | Strapi-aligned controls | Contentful primitive | Arclayer backend config | Admin controls | Payload evidence | Test evidence | Gap status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `short_text` | default, required, unique, min/max length, regex-like validation, private/hidden, condition | `present`, `unique`, `size`, `regexp`, `localized`, `omitted` | `defaultValue`, `localizable`, `unique`, `minLength`, `maxLength`, `pattern`, `hiddenInEditor`, `omitFromApiResponse`, `condition` | text default, regex, min/max length, settings toggles, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Supported |
| `rich_text` | default, required, min/max length, private/hidden, condition | `present`, `size`, `localized`, `omitted` | `defaultValue`, `editor`, `localizable`, `minLength`, `maxLength`, settings, `condition` | text default, min/max length, settings toggles, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Regex intentionally not exposed; backend schema must not advertise unsupported rich-text regex |
| `markdown` | default, required, min/max length, private/hidden, condition | `present`, `size`, `localized`, `omitted` | `defaultValue`, `editor`, `localizable`, `minLength`, `maxLength`, settings, `condition` | text default, min/max length, settings toggles, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Regex not implemented for markdown |
| `slug` | default, required, unique, min/max length, pattern, private/hidden, condition | `present`, `unique`, `size`, `regexp`, `omitted` | `defaultValue`, `localizable`, `unique`, `minLength`, `maxLength`, `pattern`, settings, `condition` | text default, regex, min/max length, settings toggles, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Supported |
| `email` | default, required, unique, min/max length, pattern, private/hidden, condition | `present`, `unique`, `size`, `regexp`, `omitted` | `defaultValue`, `localizable`, `unique`, `minLength`, `maxLength`, `pattern`, settings, `condition` | text default, regex, min/max length, settings toggles, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Supported |
| `password` | required, min/max length, private/hidden | `present`, `size`, `omitted` | `defaultValue`, `minLength`, `maxLength`, forced `omitFromApiResponse`, settings | text default, min/max length, write-only omit behavior | `buildContentModelFieldPayload` | `content-model-field-password.test.ts`, `content-model-field-config-matrix.test.ts` | Pattern intentionally not supported |
| `number` | number format, default, required, unique, min/max, private/hidden, condition | `present`, `unique`, `range`, `omitted` | `numberFormat`, `defaultValue`, `min`, `max`, settings, `condition` | number variant, numeric default, min/max value, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Supported |
| `decimal` | decimal precision, default, min/max, private/hidden, condition | `present`, `range`, `omitted` | `decimalPlaces`, `defaultValue`, `min`, `max`, settings, `condition` | number variant, decimal places, numeric default, min/max value | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx` | Supported |
| `biginteger` | integer default, min/max, private/hidden, condition | `present`, `range`, `omitted` | `defaultValue`, `min`, `max`, settings, `condition` | number variant, numeric default, min/max value | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Supported |
| `enumeration` | options, default option select, required, unique, GraphQL enum name override, condition | `present`, `unique`, `in`, `omitted` | `options`, `defaultValue`, settings, `condition` | options textarea, default option select, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx`, backend enum default validation test | Strapi `enumName` GraphQL override is not implemented because no Arclayer GraphQL enum-name contract exists |
| `date_time` | date/time variant, default, required, unique, private/hidden, condition | `present`, `unique`, `range`, `omitted` | `defaultValue`, settings, `condition` | date variant selector, default value, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Contentful date range is a gap until Arclayer has backend date-bound semantics |
| `time` | time variant, default, required, unique, private/hidden, condition | `present`, `unique`, `range`, `omitted` | `defaultValue`, settings, `condition` | date variant selector, default value, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Contentful time range is a gap until Arclayer has backend time-bound semantics |
| `date` | date variant, default, required, unique, private/hidden, condition | `present`, `unique`, `range`, `omitted` | `defaultValue`, settings, `condition` | date variant selector, default value, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Contentful date range is a gap until Arclayer has backend date-bound semantics |
| `media` | single/multiple, accepted media type, required, private/hidden, condition | `present`, `size`, `linkMimetypeGroup`, `omitted` | `mediaMode`, `assetScope`, `allowedTypes`, `min`, `max`, settings, `condition` | media quantity, accepted media checkboxes, multi-file min/max, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx`, backend media bounds tests | Contentful asset file size and image-dimension validations are gaps because Arclayer has no asset-metadata validation contract here |
| `location` | required, private/hidden, condition | `present`, `omitted` | settings, `condition` | settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | No geospatial bounds/shape validation contract exists |
| `boolean` | default boolean select, required, private/hidden, condition | `present`, `omitted` | `defaultValue`, settings, `condition` | boolean default radio, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | Supported |
| `json_object` | required, private/hidden, condition | `present`, `omitted` | settings, `condition` | settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts` | No JSON schema validation editor exists |
| `reference` | single/multiple, target model, required, private/hidden, condition | `present`, `size`, `linkContentType`, `omitted` | `referenceMode`, `targetModelKey`, `min`, `max`, settings, `condition` | reference quantity, target model select, multi-reference min/max, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx`, backend reference bounds tests | Multiple target model selection is not implemented; current contract stores one target model |
| `component` | target component, repeatable mode, min/max repeat count, required, private/hidden, condition | `present`, `size`, `omitted` | `targetComponentKey`, `repeatable`, `min`, `max`, settings, `condition` | component select, repeatable toggle, repeat min/max, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx`, backend component bounds tests | Supported for one component target |
| `dynamic_zone` | allowed components, min/max count, required, private/hidden, condition | `present`, `size`, `omitted` | `components`, `min`, `max`, settings, `condition` | allowed component checkboxes, min/max components, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx` | Supported |
| `blocks` | allowed block types, min/max blocks, required, private/hidden, condition | `present`, `size`, `omitted` | `allowedBlocks`, `min`, `max`, settings, `condition` | allowed block identifiers, min/max blocks, settings, condition | `buildContentModelFieldPayload` | `content-model-field-config-matrix.test.ts`, `content-model-edit-screen.test.tsx` | Supported |

## Cross-Type Gaps Kept Explicit

- Strapi condition editor supports `is` / `is not` and `show` / `hide`. Arclayer currently stores a narrower `source` + `equals` condition shape. This remains a conscious gap until runtime conditional rendering supports the richer action/operator model.
- Contentful asset file-size and image-dimension validations are not implemented because Arclayer's content model field config does not yet consume asset metadata constraints.
- Contentful date/time range validations are not implemented because Arclayer has no backend date-bound contract in the field type registry or runtime validators.
- Strapi enumeration GraphQL `enumName` is not implemented because Arclayer has no exposed GraphQL enum naming contract for content fields.
