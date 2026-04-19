from __future__ import annotations

from uuid import UUID

from src.modules.sites.graphql.subscriptions import (
    build_preview_collaboration_subscription_event,
    build_publish_release_subscription_event,
    graphql_subscription_manifest,
    list_graphql_subscription_events,
)


def test_graphql_subscription_manifest_describes_publish_and_preview_topics() -> None:
    assert graphql_subscription_manifest() == {
        "events": [
            {
                "description": "Raised when a site publish release becomes the active delivery graph.",
                "name": "publish.release",
                "payloadFields": ["siteId", "workspaceId", "releaseId", "releaseNumber"],
                "topic": "sites.publish.release",
            },
            {
                "description": "Raised when preview collaboration presence changes for a document.",
                "name": "preview.collaboration",
                "payloadFields": ["siteId", "docKey", "clientId", "actor", "updatedAtMs"],
                "topic": "sites.preview.collaboration",
            },
        ],
        "mode": "contract-only",
        "runtime": "deferred",
    }
    assert [event.name for event in list_graphql_subscription_events()] == [
        "publish.release",
        "preview.collaboration",
    ]


def test_build_publish_release_subscription_event() -> None:
    event = build_publish_release_subscription_event(
        site_id=UUID("00000000-0000-0000-0000-000000000111"),
        workspace_id=UUID("00000000-0000-0000-0000-000000000222"),
        release_id=UUID("00000000-0000-0000-0000-000000000333"),
        release_number=7,
    )

    assert event.event == "publish.release"
    assert str(event.site_id) == "00000000-0000-0000-0000-000000000111"
    assert event.release_number == 7


def test_build_preview_collaboration_subscription_event() -> None:
    event = build_preview_collaboration_subscription_event(
        site_id=UUID("00000000-0000-0000-0000-000000000111"),
        doc_key="article:hero",
        client_id="client-1",
        actor={"name": "Ada"},
        updated_at_ms=1234,
    )

    assert event.event == "preview.collaboration"
    assert event.doc_key == "article:hero"
    assert event.actor == {"name": "Ada"}
    assert event.updated_at_ms == 1234
