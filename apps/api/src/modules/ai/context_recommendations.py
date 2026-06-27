from __future__ import annotations

import re
from typing import Literal
from urllib.parse import parse_qs
from uuid import UUID

from pydantic import ConfigDict

from src.agents.settings_policy import bool_setting, skill_disabled_reason
from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.models.agents.conversation import AgentConversationMode
from src.modules.ai.schema import AIConversationMessage

ContextSurface = Literal[
    "system-settings",
    "content-workbench",
    "asset-library",
    "project-settings",
    "admin",
]

_PROJECT_CONTENT_ITEM_RE = re.compile(r"^/projects/(?P<project_id>[^/]+)/content/library/(?P<item_id>[^/?#]+)")
_PROJECT_CONTENT_MODEL_EDIT_RE = re.compile(r"^/projects/(?P<project_id>[^/]+)/content/models/edit(?:/|$)")
_PROJECT_CONTENT_RE = re.compile(r"^/projects/(?P<project_id>[^/]+)/content(?:/|$)")
_PROJECT_ASSETS_RE = re.compile(r"^/projects/(?P<project_id>[^/]+)/assets(?:/|$)")
_PROJECT_SETTINGS_RE = re.compile(r"^/projects/(?P<project_id>[^/]+)/settings(?:/|$)")
_SYSTEM_SETTINGS_RE = re.compile(r"^/system/settings(?:/(?P<section>[^/?#]+))?")


class ContextRecommendation(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    action_id: str
    label: str
    description: str
    mode: AgentConversationMode
    priority: int
    agent_id: str | None = None
    skill_id: str | None = None
    requires_approval: bool = False
    enabled: bool = True
    disabled_reason: str | None = None

    def to_json(self) -> JsonObject:
        data: JsonObject = {
            "actionId": self.action_id,
            "label": self.label,
            "description": self.description,
            "mode": str(self.mode),
            "priority": self.priority,
        }
        if self.agent_id is not None:
            data["agentId"] = self.agent_id
        if self.skill_id is not None:
            data["skillId"] = self.skill_id
        if self.requires_approval:
            data["requiresApproval"] = True
        if not self.enabled:
            data["enabled"] = False
        if self.disabled_reason is not None:
            data["disabledReason"] = self.disabled_reason
        return data


def enrich_conversation_context_snapshot(
    snapshot: JsonObject,
    *,
    mode: AgentConversationMode,
    project_id: UUID | None,
    messages: list[AIConversationMessage],
    agent_settings: dict[str, object] | None = None,
) -> JsonObject:
    pathname = _text(snapshot.get("pathname"))
    search = _text(snapshot.get("search"))
    analysis = _analyze_path(pathname=pathname, search=search, project_id=project_id)
    recommendations = _apply_agent_settings(
        _recommendations_for_context(
            surface=analysis.surface,
            section=analysis.section,
            entity_type=analysis.entity_type,
            mode=mode,
            latest_user_message=_latest_user_message(messages),
        ),
        agent_settings=agent_settings,
    )
    client_recommended_actions = _string_list(snapshot.get("recommendedActions"))

    enriched: JsonObject = {
        **snapshot,
        "pathname": pathname,
        "search": search,
        "surface": analysis.surface,
        "contextAnalysisVersion": 1,
        "recommendedMode": str(_recommended_mode(recommendations, mode)),
        "recommendedActions": [item.action_id for item in recommendations],
        "recommendedActionDetails": [item.to_json() for item in recommendations],
    }
    if analysis.section is not None:
        enriched["section"] = analysis.section
    if analysis.entity_type is not None:
        enriched["entity"] = {
            "type": analysis.entity_type,
            "id": analysis.entity_id,
        }
    if analysis.project_id is not None:
        enriched["projectId"] = analysis.project_id
    if client_recommended_actions:
        enriched["clientRecommendedActions"] = client_recommended_actions
    return enriched


class _ContextAnalysis(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    surface: ContextSurface
    section: str | None = None
    project_id: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None


def _analyze_path(*, pathname: str, search: str, project_id: UUID | None) -> _ContextAnalysis:
    if match := _SYSTEM_SETTINGS_RE.match(pathname):
        return _ContextAnalysis(surface="system-settings", section=match.group("section") or "overview")
    if match := _PROJECT_CONTENT_ITEM_RE.match(pathname):
        return _ContextAnalysis(
            surface="content-workbench",
            project_id=match.group("project_id"),
            entity_type="content-item",
            entity_id=match.group("item_id"),
        )
    if match := _PROJECT_CONTENT_MODEL_EDIT_RE.match(pathname):
        query = _query_params(search)
        model_id = _query_text(query, "modelId")
        if model_id:
            return _ContextAnalysis(
                surface="content-workbench",
                section=_query_text(query, "section") or None,
                project_id=match.group("project_id"),
                entity_type="content-model",
                entity_id=model_id,
            )
        return _ContextAnalysis(
            surface="content-workbench",
            section=_query_text(query, "section") or None,
            project_id=match.group("project_id"),
        )
    if match := _PROJECT_CONTENT_RE.match(pathname):
        return _ContextAnalysis(surface="content-workbench", project_id=match.group("project_id"))
    if match := _PROJECT_ASSETS_RE.match(pathname):
        return _ContextAnalysis(surface="asset-library", project_id=match.group("project_id"))
    if match := _PROJECT_SETTINGS_RE.match(pathname):
        return _ContextAnalysis(surface="project-settings", project_id=match.group("project_id"))
    return _ContextAnalysis(surface="admin", project_id=str(project_id) if project_id is not None else None)


def _recommendations_for_context(
    *,
    surface: ContextSurface,
    section: str | None,
    entity_type: str | None,
    mode: AgentConversationMode,
    latest_user_message: str | None,
) -> tuple[ContextRecommendation, ...]:
    if surface == "system-settings" and section == "access":
        return _rank_recommendations(
            (
                ContextRecommendation(
                    action_id="audit-role-permissions",
                    label="Audit role permissions",
                    description="Review role grants and identify risky access policy gaps.",
                    mode=AgentConversationMode.PLAN,
                    priority=1,
                ),
                ContextRecommendation(
                    action_id="explain-access-policy",
                    label="Explain access policy",
                    description="Summarize the current access model and operational implications.",
                    mode=AgentConversationMode.PLAN,
                    priority=2,
                ),
                ContextRecommendation(
                    action_id="find-risky-grants",
                    label="Find risky grants",
                    description="Highlight permissions that should require tighter governance.",
                    mode=AgentConversationMode.AGENT,
                    priority=3,
                ),
            ),
            latest_user_message=latest_user_message,
        )
    if surface == "system-settings" and section == "agents":
        return _rank_recommendations(
            (
                ContextRecommendation(
                    action_id="review-agent-policy",
                    label="Review agent policy",
                    description="Check enabled modes, skills, write-tool policy, and approval requirements.",
                    mode=AgentConversationMode.PLAN,
                    priority=1,
                ),
                ContextRecommendation(
                    action_id="test-agent-capabilities",
                    label="Test agent capabilities",
                    description="Run a read-only capability check before enabling write workflows.",
                    mode=AgentConversationMode.AGENT,
                    priority=2,
                    agent_id="content_analyzer",
                    skill_id="content.analysis",
                ),
                ContextRecommendation(
                    action_id="inspect-ai-usage",
                    label="Inspect AI usage",
                    description="Review conversation retention, budget, and model-routing configuration.",
                    mode=AgentConversationMode.BUILD,
                    priority=3,
                ),
            ),
            latest_user_message=latest_user_message,
        )
    if surface == "content-workbench" and entity_type == "content-item":
        return _rank_recommendations(
            (
                ContextRecommendation(
                    action_id="analyze-content-quality",
                    label="Analyze content quality",
                    description="Inspect the current entry for completeness, workflow readiness, and risks.",
                    mode=AgentConversationMode.AGENT,
                    priority=1,
                    agent_id="content_analyzer",
                    skill_id="content.analysis",
                ),
                ContextRecommendation(
                    action_id="plan-content-update",
                    label="Plan content update",
                    description="Turn the current entry state into a staged editorial plan.",
                    mode=AgentConversationMode.PLAN,
                    priority=2,
                    agent_id="content_advisor",
                    skill_id="content.planning",
                ),
                ContextRecommendation(
                    action_id="draft-entry-changes",
                    label="Draft entry changes",
                    description="Prepare a content draft proposal that must pass approval before applying.",
                    mode=AgentConversationMode.AGENT,
                    priority=3,
                    skill_id="content.writer",
                    requires_approval=True,
                ),
            ),
            latest_user_message=latest_user_message,
        )
    if surface == "content-workbench" and entity_type == "content-model":
        return _rank_recommendations(
            (
                ContextRecommendation(
                    action_id="analyze-model-structure",
                    label="Analyze model structure",
                    description="Inspect the current model fields, validation gaps, and migration risks.",
                    mode=AgentConversationMode.AGENT,
                    priority=1,
                    agent_id="content_model_advisor",
                    skill_id="content.modeling",
                ),
                ContextRecommendation(
                    action_id="plan-schema-change",
                    label="Plan schema change",
                    description="Turn the current model state into a staged schema update plan.",
                    mode=AgentConversationMode.PLAN,
                    priority=2,
                    agent_id="content_model_advisor",
                    skill_id="content.modeling",
                ),
                ContextRecommendation(
                    action_id="draft-model-changes",
                    label="Draft model changes",
                    description="Prepare a content model patch proposal that must pass approval before applying.",
                    mode=AgentConversationMode.AGENT,
                    priority=3,
                    agent_id="content_model_advisor",
                    skill_id="content.modeler",
                    requires_approval=True,
                ),
            ),
            latest_user_message=latest_user_message,
        )
    if surface == "content-workbench":
        return _rank_recommendations(
            (
                ContextRecommendation(
                    action_id="analyze-content-inventory",
                    label="Analyze content inventory",
                    description="Find content health patterns across the current library view.",
                    mode=AgentConversationMode.AGENT,
                    priority=1,
                    agent_id="content_analyzer",
                    skill_id="content.analysis",
                ),
                ContextRecommendation(
                    action_id="plan-content-modeling",
                    label="Plan content modeling",
                    description="Identify model and workflow improvements for the current content set.",
                    mode=AgentConversationMode.PLAN,
                    priority=2,
                    agent_id="content_model_advisor",
                    skill_id="content.modeling",
                ),
                ContextRecommendation(
                    action_id="build-content-blueprint",
                    label="Build content blueprint",
                    description="Create an implementation blueprint for content operations without applying changes.",
                    mode=AgentConversationMode.BUILD,
                    priority=3,
                    agent_id="content_builder",
                    skill_id="content.build",
                ),
            ),
            latest_user_message=latest_user_message,
        )
    if surface == "asset-library":
        return (
            ContextRecommendation(
                action_id="summarize-asset-library",
                label="Summarize asset library",
                description="Review asset organization and identify metadata cleanup opportunities.",
                mode=AgentConversationMode.PLAN,
                priority=1,
            ),
        )
    return _default_recommendations(mode=mode, latest_user_message=latest_user_message)


def _rank_recommendations(
    recommendations: tuple[ContextRecommendation, ...],
    *,
    latest_user_message: str | None,
) -> tuple[ContextRecommendation, ...]:
    intent = _message_intent(latest_user_message)
    if intent is None:
        return recommendations
    ranked = sorted(
        recommendations,
        key=lambda recommendation: (
            0 if _recommendation_matches_intent(recommendation, intent) else 1,
            recommendation.priority,
        ),
    )
    return tuple(
        recommendation.model_copy(update={"priority": index + 1}) for index, recommendation in enumerate(ranked)
    )


def _message_intent(message: str | None) -> AgentConversationMode | Literal["write"] | None:
    if not message:
        return None
    normalized = message.lower()
    if any(term in normalized for term in ("build", "implement", "blueprint")):
        return AgentConversationMode.BUILD
    if any(term in normalized for term in ("plan", "strategy", "roadmap", "review", "audit")):
        return AgentConversationMode.PLAN
    if any(term in normalized for term in ("analyze", "inspect", "check")):
        return AgentConversationMode.AGENT
    if any(term in normalized for term in ("draft", "write", "change", "update", "create", "apply")):
        return "write"
    return None


def _recommendation_matches_intent(
    recommendation: ContextRecommendation,
    intent: AgentConversationMode | Literal["write"],
) -> bool:
    if intent == "write":
        return recommendation.requires_approval
    return recommendation.mode == intent


def _default_recommendations(
    *,
    mode: AgentConversationMode,
    latest_user_message: str | None,
) -> tuple[ContextRecommendation, ...]:
    intent = _message_intent(latest_user_message)
    first_mode = intent if isinstance(intent, AgentConversationMode) else mode
    return (
        ContextRecommendation(
            action_id="summarize-current-page",
            label="Summarize current page",
            description="Explain the visible workspace context and relevant next decisions.",
            mode=first_mode,
            priority=1,
        ),
        ContextRecommendation(
            action_id="plan-next-action",
            label="Plan next action",
            description="Produce an ordered plan grounded in the current Admin context.",
            mode=AgentConversationMode.PLAN,
            priority=2,
        ),
        ContextRecommendation(
            action_id="answer-context-question",
            label="Answer context question",
            description="Answer a focused question using the current workspace and page context.",
            mode=mode,
            priority=3,
        ),
    )


def _recommended_mode(
    recommendations: tuple[ContextRecommendation, ...],
    current_mode: AgentConversationMode,
) -> AgentConversationMode:
    for recommendation in recommendations:
        if recommendation.enabled:
            return recommendation.mode
    return current_mode


def _apply_agent_settings(
    recommendations: tuple[ContextRecommendation, ...],
    *,
    agent_settings: dict[str, object] | None,
) -> tuple[ContextRecommendation, ...]:
    if agent_settings is None:
        return recommendations
    return tuple(_with_agent_settings(recommendation, agent_settings) for recommendation in recommendations)


def _with_agent_settings(
    recommendation: ContextRecommendation,
    agent_settings: dict[str, object],
) -> ContextRecommendation:
    reason = _recommendation_disabled_reason(recommendation, agent_settings)
    if reason is None:
        return recommendation.model_copy(update={"enabled": True, "disabled_reason": None})
    return recommendation.model_copy(update={"enabled": False, "disabled_reason": reason})


def _recommendation_disabled_reason(
    recommendation: ContextRecommendation,
    agent_settings: dict[str, object],
) -> str | None:
    if recommendation.skill_id is not None:
        return skill_disabled_reason(agent_settings, skill_id=recommendation.skill_id)
    if recommendation.agent_id is not None and not bool_setting(agent_settings, "enabled", True):
        return "agents_disabled"
    return None


def _latest_user_message(messages: list[AIConversationMessage]) -> str | None:
    for message in reversed(messages):
        if message.role == "user" and message.content.strip():
            return message.content.strip()
    return None


def _text(value: JsonValue | None) -> str:
    return value if isinstance(value, str) else ""


def _query_params(search: str) -> dict[str, list[str]]:
    return parse_qs(search[1:] if search.startswith("?") else search)


def _query_text(query: dict[str, list[str]], key: str) -> str:
    value = query.get(key, [""])[0]
    return value.strip()


def _string_list(value: JsonValue | None) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item.strip()]
