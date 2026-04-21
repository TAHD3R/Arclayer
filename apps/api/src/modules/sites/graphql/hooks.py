from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.modules.sites.graphql.planner import GraphQLQueryPlan
from src.modules.sites.graphql.registry import list_graphql_model_schemas


@dataclass(frozen=True, slots=True)
class GraphQLSchemaFieldHookDefinition:
    name: str
    phase: str
    model_keys: tuple[str, ...]
    description: str


@dataclass(frozen=True, slots=True)
class GraphQLQueryHookDefinition:
    name: str
    phase: str
    model_keys: tuple[str, ...]
    description: str


class GraphQLQueryPostProcessorHook(Protocol):
    definition: GraphQLQueryHookDefinition

    def process(self, *, plan: GraphQLQueryPlan, records: list[object]) -> list[object]: ...


@dataclass(frozen=True, slots=True)
class OfficialProtocolQueryPostProcessorHook:
    definition: GraphQLQueryHookDefinition

    def process(self, *, plan: GraphQLQueryPlan, records: list[object]) -> list[object]:
        return records


def _model_keys_by_hook_name(attribute: str) -> dict[str, tuple[str, ...]]:
    grouped: dict[str, list[str]] = {}
    for schema in list_graphql_model_schemas():
        hook_name = str(getattr(schema, attribute))
        grouped.setdefault(hook_name, []).append(schema.model_key)
    return {name: tuple(sorted(model_keys)) for name, model_keys in sorted(grouped.items())}


def list_graphql_schema_field_hooks() -> tuple[GraphQLSchemaFieldHookDefinition, ...]:
    return tuple(
        GraphQLSchemaFieldHookDefinition(
            name=name,
            phase="schema",
            model_keys=model_keys,
            description="Projects official model protocol system fields into the delivery GraphQL schema.",
        )
        for name, model_keys in _model_keys_by_hook_name("schema_field_provider").items()
    )


def list_graphql_query_hooks() -> tuple[GraphQLQueryHookDefinition, ...]:
    return tuple(
        GraphQLQueryHookDefinition(
            name=name,
            phase="query",
            model_keys=model_keys,
            description="Applies the official model protocol query contract to delivery GraphQL records.",
        )
        for name, model_keys in _model_keys_by_hook_name("query_post_processor").items()
    )


def list_graphql_query_post_processors() -> tuple[GraphQLQueryPostProcessorHook, ...]:
    return tuple(
        OfficialProtocolQueryPostProcessorHook(definition=definition) for definition in list_graphql_query_hooks()
    )


def apply_graphql_query_post_processors(*, plan: GraphQLQueryPlan, records: list[object]) -> list[object]:
    processed = records
    for hook in list_graphql_query_post_processors():
        if plan.model_key not in hook.definition.model_keys:
            continue
        processed = hook.process(plan=plan, records=processed)
    return processed


def graphql_hooks_manifest() -> dict[str, object]:
    return {
        "queryPostProcessors": [
            {
                "description": hook.description,
                "modelKeys": list(hook.model_keys),
                "name": hook.name,
                "phase": hook.phase,
            }
            for hook in list_graphql_query_hooks()
        ],
        "schemaFieldProviders": [
            {
                "description": hook.description,
                "modelKeys": list(hook.model_keys),
                "name": hook.name,
                "phase": hook.phase,
            }
            for hook in list_graphql_schema_field_hooks()
        ],
    }
