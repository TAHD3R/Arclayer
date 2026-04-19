from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

GraphQLSubscriptionEventName = Literal["publish.release", "preview.collaboration"]


@dataclass(frozen=True, slots=True)
class GraphQLSubscriptionEventDefinition:
    name: GraphQLSubscriptionEventName
    topic: str
    payload_fields: tuple[str, ...]
    description: str


@dataclass(frozen=True, slots=True)
class GraphQLPublishReleaseEvent:
    event: Literal["publish.release"]
    site_id: UUID
    workspace_id: UUID
    release_id: UUID
    release_number: int


@dataclass(frozen=True, slots=True)
class GraphQLPreviewCollaborationEvent:
    event: Literal["preview.collaboration"]
    site_id: UUID
    doc_key: str
    client_id: str
    actor: dict[str, str] | None
    updated_at_ms: int


def list_graphql_subscription_events() -> tuple[GraphQLSubscriptionEventDefinition, ...]:
    return (
        GraphQLSubscriptionEventDefinition(
            name="publish.release",
            topic="sites.publish.release",
            payload_fields=("siteId", "workspaceId", "releaseId", "releaseNumber"),
            description="Raised when a site publish release becomes the active delivery graph.",
        ),
        GraphQLSubscriptionEventDefinition(
            name="preview.collaboration",
            topic="sites.preview.collaboration",
            payload_fields=("siteId", "docKey", "clientId", "actor", "updatedAtMs"),
            description="Raised when preview collaboration presence changes for a document.",
        ),
    )


def graphql_subscription_manifest() -> dict[str, object]:
    return {
        "events": [
            {
                "description": event.description,
                "name": event.name,
                "payloadFields": list(event.payload_fields),
                "topic": event.topic,
            }
            for event in list_graphql_subscription_events()
        ],
        "mode": "contract-only",
        "runtime": "deferred",
    }


def build_publish_release_subscription_event(
    *,
    site_id: UUID,
    workspace_id: UUID,
    release_id: UUID,
    release_number: int,
) -> GraphQLPublishReleaseEvent:
    return GraphQLPublishReleaseEvent(
        event="publish.release",
        site_id=site_id,
        workspace_id=workspace_id,
        release_id=release_id,
        release_number=release_number,
    )


def build_preview_collaboration_subscription_event(
    *,
    site_id: UUID,
    doc_key: str,
    client_id: str,
    actor: dict[str, str] | None,
    updated_at_ms: int,
) -> GraphQLPreviewCollaborationEvent:
    return GraphQLPreviewCollaborationEvent(
        event="preview.collaboration",
        site_id=site_id,
        doc_key=doc_key,
        client_id=client_id,
        actor=actor,
        updated_at_ms=updated_at_ms,
    )
