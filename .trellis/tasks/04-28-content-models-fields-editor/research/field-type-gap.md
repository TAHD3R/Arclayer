# Field Type Gap Notes

## Repo Truth

### Current backend field scalar contract

`apps/api/src/modules/projects/content/contracts/schema.py`

* `FieldScalarType = "text" | "long_text" | "number" | "boolean" | "date_time" | "json"`
* `RelationType = "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many"`

### Current persistence enums

`apps/api/src/models/content/_enums.py`

* `ContentModelFieldType`: `text / long_text / number / boolean / date_time / json`
* `ContentModelRelationType`: `one_to_one / one_to_many / many_to_one / many_to_many`

### Current storage shape

* `ContentModelFieldRecord` has `config` and `sort_order`
* `ContentModelRelationRecord` has `config` and `sort_order`
* Current router exposes:
  - create/update/delete/reorder for fields
  - create/update/delete for whole model
  - no dedicated relation CRUD endpoints
  - no dedicated relation reorder endpoint

### Existing UI prototype

`apps/admin/src/pages/projects/content/models/page.tsx.bak`

* already proved the repo once supported:
  - `addContentModelField`
  - `updateContentModelField`
  - `reorderContentModelFields`
  - `deleteContentModelField`
* prototype also encoded richer concepts like media/component/dynamic-zone into field config, while scalar stayed within the 6-value backend enum

## Audit Truth

`docs/plans/AUDIT_REPORT.md`

* Current Arclayer gap: field type count is a key deficit
* Strapi baseline includes:
  - rich text
  - integer / decimal / float / biginteger
  - date / time / datetime / timestamp
  - media
  - relation
  - many more beyond this task
* Audit’s recommended long-term direction is registry-driven field types

## Convergence For This Task

This task should implement a first-wave product field catalog aligned to the user-provided screenshots:

* Rich text
* Short text
* Number
* Date & time
* Media
* Boolean
* JSON object
* Reference

### Recommended implementation boundary

* Expand the model-definition UX and data mapping for those 8 product field types
* Keep runtime/document delivery out of scope
* Reuse current `config` payloads to express subtype details where full backend enum fan-out is not yet required
* Treat `Reference` carefully because it wants relation semantics and shared ordering with fields

### Risk

`Reference` is the one product type that most strongly pressures the current contract surface:

* if modeled as real relation:
  - needs unified table row modeling
  - needs add/delete/update flows that touch relations
  - likely needs reorder support for relations
* if modeled as field config only:
  - faster for UX
  - weaker semantic contract for downstream runtime use

Given the user request centers on model-definition editing, model-definition-first delivery is acceptable as long as the chosen contract stays explicit in code and tests.
