from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.modules.sites.graphql.planner import GraphQLQueryPlan


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


def list_graphql_schema_field_hooks() -> tuple[GraphQLSchemaFieldHookDefinition, ...]:
    return ()


def list_graphql_query_hooks() -> tuple[GraphQLQueryHookDefinition, ...]:
    return ()


def list_graphql_query_post_processors() -> tuple[GraphQLQueryPostProcessorHook, ...]:
    return ()


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
