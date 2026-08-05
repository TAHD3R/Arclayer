# Shared Schema & Field Contracts

This code-spec defines shared schema semantics for Pydantic, OpenAPI, content model fields, and frontend type consumption.

## Scenario: Schema Semantics From Backend to UI

### 1. Scope / Trigger

- Trigger: adding or changing Pydantic schemas, generated OpenAPI fields, content model fields, field storage metadata, or frontend consumers of those fields.
- Applies to backend schema files, generated Admin types, content model schema snapshots, storage sync metadata, and frontend forms/tables that render schema-defined fields.

### 2. Signatures

- Backend schema base: `BaseSchema`, `BaseOut`, or module-specific Pydantic v2 models
- Strict schema config: `ConfigDict(extra="forbid")`
- Immutable value config: `ConfigDict(frozen=True)`
- Field default factory: `Field(default_factory=list)` or `Field(default_factory=dict)`
- JSON serialization: `model_dump(mode="json")`
- OpenAPI-generated frontend imports: `@arclayer/openapi` or `@arclayer/openapi`
- Content model storage payload: `ContentModelSchemaChangePlanOut.storage_sync`

### 3. Contracts

- Backend schemas define external field names, optionality, enum/literal values, and nested object shape.
- Frontend consumes generated schema types and may create UI projections only after the generated boundary.
- Request schemas should reject unknown input when the domain expects a closed shape.
- Immutable backend value objects use Pydantic v2 frozen models, not dataclasses.
- Mutable list/dict defaults must use `Field(default_factory=...)`.
- Content field storage semantics must be expressed through `storage_sync`, including scalar, `db_column_type`, JSON path, required, unique, indexed, localizable, and `omit_from_api_response`.
- Field omissions from API responses are explicit contract values, not frontend filtering guesses.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Unknown request field reaches closed schema | Pydantic rejects with validation error |
| Mutable default is needed | Use `Field(default_factory=...)` |
| Frontend needs enum values | Import generated union/enum type or derive from generated contract |
| Field is hidden from delivery response | Backend sets `omit_from_api_response`; frontend does not guess hidden fields |
| Field storage hint changes | Update storage sync plan and frontend field editor assumptions |
| Schema revision changes | Include revision contract in preview/publish/impact responses |

### 5. Good/Base/Bad Cases

- Good: backend schema uses `model_config = BaseSchema.model_config | ConfigDict(extra="forbid")` for a closed request body.
- Good: frontend imports generated field type unions instead of duplicating string literals.
- Base: a frontend form state type adds local dirty/error flags while preserving generated payload type at submit.
- Bad: backend uses a dataclass for a production schema value object.
- Bad: frontend decides a field is omitted from API response because the label starts with `_`.

### 6. Tests Required

- Backend schema tests for good/base/bad payload validation.
- OpenAPI/typecheck verification after schema contract changes.
- Frontend form tests for schema-driven required/optional fields.
- Content model storage tests for `storage_sync` fields and migrations when content schema semantics change.

### 7. Wrong vs Correct

#### Wrong

```typescript
const hidden = field.key.startsWith('_')
```

#### Correct

```typescript
const hidden = field.omitFromApiResponse === true
```

Frontend behavior follows explicit backend schema semantics.
