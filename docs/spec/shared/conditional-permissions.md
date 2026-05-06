# Conditional Permissions

Conditional permissions are explicit metadata attached to permission grants.
They are evaluated by backend policy services against authoritative resource
attributes loaded by services or repositories.

## Supported Fields

- `owner_user_id`: content owner or creator user id.
- `workspace_id`: workspace that owns the resource.
- `project_id`: project that owns the resource.
- `content_type`: content model key.
- `locale`: content locale.
- `workflow_stage`: editorial workflow stage.

## Supported Operators

- `equals`: static scalar equality.
- `in`: static list membership.
- `equals_current_user`: compares the resource field to the current actor id.
- `equals_current_workspace`: compares the resource field to the active workspace id.
- `equals_current_project`: compares the resource field to the active project id.

Multiple conditions inside one condition set are ANDed. Multiple condition sets
attached to the same grant are ORed.

## Unsupported Condition Types

Unsupported condition types include arbitrary code, nested policy scripts,
unbounded expressions, cross-resource joins, regex matching, and request-body
overrides. Unsupported fields, operators, and invalid value shapes fail Pydantic
validation before evaluation.

Policy services must evaluate conditions against resource attributes loaded by
backend code. Request parameters and payload fields can be copied into
`payload_constraints` for diagnostics. Access decisions use
`resource_attributes`.
