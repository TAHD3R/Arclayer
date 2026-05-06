# API Frontend Type Safety

This code-spec defines frontend type safety for generated API contracts.

## Scenario: Generated Contract Types

### 1. Scope / Trigger

- Trigger: adding or changing frontend API types, generated OpenAPI usage, runtime narrowing, or request payload construction.
- Applies to all frontend code that consumes backend-generated types.

### 2. Signatures

- Generated imports: `@arclayer/openapi`, `@arclayer/openapi/admin-types`
- Generated source package: `packages/openapi`
- UI-only projections: `*ViewModel`, `*Row`, `*FormState`, `*UiState`
- Submit mapper naming: `map<FormState>To<RequestType>()`
- API mapper naming: `map<ResponseType>To<ViewModel>()`
- Unknown boundary type: `unknown`
- Forbidden broad type: `any`

### 3. Contracts

- Generated types own backend request and response shapes.
- UI-only types must be named as projections and should not masquerade as backend payloads.
- `any` is forbidden for API contract work.
- Use `unknown` plus narrowing for untrusted browser/provider data.
- Submit payloads must be typed before reaching the API layer.
- Mapper functions are boundary code. Their parameter and return types must make the source/target contract visible and should not hide generated payloads behind broad local aliases.
- Optional backend fields must be handled according to product semantics: distinguish absent, explicit `null`, empty collection, and empty string when the backend contract distinguishes them.
- Type assertions must be local and justified by generated or runtime validation evidence.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Backend schema changes | Typecheck frontend generated consumers |
| Local duplicated API payload type appears | Replace with generated type |
| Untrusted data enters frontend | Narrow from `unknown` |
| Assertion crosses API boundary | Replace with generated type or runtime validation |
| Mapper receives generated response | Type the parameter with the generated response type |
| Mapper emits request payload | Type the result with the generated request type |
| Optional/null field is displayed or submitted | Preserve semantic difference unless the mapper explicitly normalizes it |

### 5. Good/Base/Bad Cases

- Good: generated `ContentModelSchemaChangePlanOut` drives UI fields.
- Good: `mapSettingsFormToWorkspaceUpdateRequest(form): WorkspaceUpdateRequest` is tested for optional and null fields.
- Base: `ContentModelFormState` stores UI editing state before submit conversion.
- Bad: `const payload: any = formValues`.
- Bad: mapper converts `null` and missing to the same value without a documented product rule.

### 6. Tests Required

- Typecheck for all API contract changes.
- Unit tests for runtime narrowing when external browser/provider data is accepted.
- Mapper tests for UI form state to generated request payload.
- Mapper tests must include optional, null, empty, and invalid values when those values cross the API boundary.

### 7. Wrong vs Correct

#### Wrong

```typescript
const payload: any = values
await updateModel(payload)
```

#### Correct

```typescript
const payload: ContentModelUpdateRequest = mapFormStateToUpdateRequest(values)
await updateModel(payload)
```

Payload conversion must be typed before transport.
