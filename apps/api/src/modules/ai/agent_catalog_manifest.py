from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Literal
from uuid import UUID

from src.modules.ai.agent_tool_grants import (
    BUILDER_DESIGN_APPLY_TOOL,
    BUILDER_DESIGN_GENERATE_TOOL,
    BUILDER_SITEMAP_APPLY_TOOL,
    BUILDER_SITEMAP_GENERATE_TOOL,
    BUILDER_SITEMAP_PREVIEW_TOOL,
    BUILDER_STYLE_GUIDE_GENERATE_TOOL,
    BUILDER_WIREFRAME_APPLY_TOOL,
    BUILDER_WIREFRAME_GENERATE_TOOL,
    HUMAN_REQUEST_INPUT_TOOL,
    PROJECT_BOOTSTRAP_TOOL,
    WORKSPACE_SKILL_CREATE_TOOL,
)

ExecutionMode = Literal["plan", "build"]

_OFFICIAL_AGENT_IDS = {
    "arclayer-coordinator": UUID("b4b4c3e2-4a88-4c3d-8f19-0a1b2c3d4e01"),
    "site-architect": UUID("b4b4c3e2-4a88-4c3d-8f19-0a1b2c3d4e02"),
    "visual-designer": UUID("b4b4c3e2-4a88-4c3d-8f19-0a1b2c3d4e03"),
    "content-writer": UUID("b4b4c3e2-4a88-4c3d-8f19-0a1b2c3d4e04"),
    "seo-strategist": UUID("b4b4c3e2-4a88-4c3d-8f19-0a1b2c3d4e05"),
    "data-analyst": UUID("b4b4c3e2-4a88-4c3d-8f19-0a1b2c3d4e06"),
}
_OFFICIAL_AGENT_VERSION_IDS = {
    ("arclayer-coordinator", 1): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e5f01"),
    ("site-architect", 1): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e5f02"),
    ("visual-designer", 1): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e5f03"),
    ("content-writer", 1): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e5f04"),
    ("seo-strategist", 1): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e5f05"),
    ("data-analyst", 1): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e5f06"),
    ("arclayer-coordinator", 2): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e6f01"),
    ("site-architect", 2): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e6f02"),
    ("visual-designer", 2): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e6f03"),
    ("arclayer-coordinator", 3): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e7f01"),
    ("arclayer-coordinator", 4): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e8f01"),
    ("site-architect", 3): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e7f02"),
    ("arclayer-coordinator", 5): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e9f01"),
    ("arclayer-coordinator", 6): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4eaf01"),
    ("arclayer-coordinator", 7): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4ebf01"),
    ("arclayer-coordinator", 8): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4ecf01"),
    ("visual-designer", 3): UUID("c5c5d4f3-5b99-4d4e-9a20-1b2c3d4e7f03"),
}
_OFFICIAL_AGENT_VERSION_KEYS_BY_ID = {version_id: key for key, version_id in _OFFICIAL_AGENT_VERSION_IDS.items()}


@dataclass(frozen=True, slots=True)
class OfficialAgentSpec:
    slug: str
    display_name: str
    role: str
    description: str
    instructions: str
    supported_execution_modes: tuple[ExecutionMode, ...]
    delegation_slugs: tuple[str, ...]
    tool_grants: tuple[str, ...]
    approval_profile: str
    sort_order: int
    is_default: bool = False
    is_pinned: bool = False
    version_number: int = 1

    @property
    def agent_id(self) -> UUID:
        return official_agent_id(self.slug)

    @property
    def version_id(self) -> UUID:
        return official_agent_version_id(self.slug, self.version_number)

    @property
    def content_checksum(self) -> str:
        payload = json.dumps(asdict(self), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def official_agent_id(slug: str) -> UUID:
    return _OFFICIAL_AGENT_IDS[slug]


def official_agent_version_id(slug: str, version_number: int) -> UUID:
    return _OFFICIAL_AGENT_VERSION_IDS[(slug, version_number)]


def official_agent_version_number(slug: str, version_id: UUID) -> int | None:
    key = _OFFICIAL_AGENT_VERSION_KEYS_BY_ID.get(version_id)
    if key is None or key[0] != slug:
        return None
    return key[1]


OFFICIAL_AGENT_SPECS: tuple[OfficialAgentSpec, ...] = (
    OfficialAgentSpec(
        slug="arclayer-coordinator",
        display_name="Arclayer Coordinator",
        role="orchestrator",
        description="Coordinates the full website workflow, specialists, decisions, approvals, and delivery evidence.",
        instructions=(
            "You are the lead Arclayer website coordinator. Turn the user's goal into a coherent site outcome, "
            "maintain scope and dependencies, delegate only through approved Agent delegation, and reconcile "
            "specialist results into one clear answer. Ground claims in project state and Knowledge citations. "
            "Never claim a write, publish, installation, payment, or external action succeeded without its typed "
            "Tool result and required approval evidence. When a request starts with /skill-creator, clarify the "
            "reusable workflow, draft a narrow Skill without new authority declarations, obtain approval, and use "
            "workspace.skill.create to persist, validate, and enable it in the active workspace."
        ),
        supported_execution_modes=("plan", "build"),
        delegation_slugs=(
            "site-architect",
            "visual-designer",
            "content-writer",
            "seo-strategist",
            "data-analyst",
        ),
        tool_grants=(
            HUMAN_REQUEST_INPUT_TOOL,
            PROJECT_BOOTSTRAP_TOOL,
            BUILDER_SITEMAP_GENERATE_TOOL,
            BUILDER_SITEMAP_PREVIEW_TOOL,
            BUILDER_SITEMAP_APPLY_TOOL,
            BUILDER_STYLE_GUIDE_GENERATE_TOOL,
            BUILDER_WIREFRAME_GENERATE_TOOL,
            BUILDER_WIREFRAME_APPLY_TOOL,
            BUILDER_DESIGN_GENERATE_TOOL,
            BUILDER_DESIGN_APPLY_TOOL,
            WORKSPACE_SKILL_CREATE_TOOL,
        ),
        approval_profile="coordinator-standard-v1",
        sort_order=0,
        is_default=True,
        is_pinned=True,
        version_number=8,
    ),
    OfficialAgentSpec(
        slug="site-architect",
        display_name="Site Architect",
        role="information_architecture",
        description="Shapes the site brief, Sitemap, page hierarchy, section intent, and Wireframe structure.",
        instructions=(
            "You are Arclayer's Site Architect. Convert business goals and audience needs into information "
            "architecture, Sitemap decisions, page purpose, section intent, content dependencies, and responsive "
            "Wireframe structure. Keep navigation understandable, bind recommendations to real project context, "
            "and expose readiness blockers instead of inventing pages or content."
        ),
        supported_execution_modes=("plan", "build"),
        delegation_slugs=("visual-designer", "content-writer", "seo-strategist"),
        tool_grants=(
            HUMAN_REQUEST_INPUT_TOOL,
            BUILDER_SITEMAP_GENERATE_TOOL,
            BUILDER_SITEMAP_PREVIEW_TOOL,
            BUILDER_SITEMAP_APPLY_TOOL,
            BUILDER_WIREFRAME_GENERATE_TOOL,
            BUILDER_WIREFRAME_APPLY_TOOL,
        ),
        approval_profile="site-architecture-v1",
        sort_order=10,
        is_pinned=True,
        version_number=3,
    ),
    OfficialAgentSpec(
        slug="visual-designer",
        display_name="Visual Designer",
        role="visual_design",
        description="Creates design direction, Style Guides, responsive composition, components, and motion behavior.",
        instructions=(
            "You are Arclayer's Visual Designer. Build a distinctive, accessible visual system from the approved "
            "brief, Design System, content intent, and component inventory. Specify typography, color, spacing, "
            "responsive composition, states, and restrained motion with reduced-motion alternatives. Reuse the "
            "canonical component system and never present placeholder styling as a completed design."
        ),
        supported_execution_modes=("plan", "build"),
        delegation_slugs=("site-architect", "content-writer"),
        tool_grants=(
            HUMAN_REQUEST_INPUT_TOOL,
            BUILDER_STYLE_GUIDE_GENERATE_TOOL,
            BUILDER_DESIGN_GENERATE_TOOL,
            BUILDER_DESIGN_APPLY_TOOL,
        ),
        approval_profile="visual-design-v1",
        sort_order=20,
        is_pinned=True,
        version_number=3,
    ),
    OfficialAgentSpec(
        slug="content-writer",
        display_name="Content Writer",
        role="content_strategy",
        description="Writes website copy, reusable content, articles, localization, and consistent product voice.",
        instructions=(
            "You are Arclayer's Content Writer. Produce product-ready copy from the site brief, page and section "
            "intent, locale, tone, content model constraints, and cited Knowledge. Preserve factual boundaries, "
            "surface missing evidence, and use typed content proposals for changes. Do not imply that generated "
            "copy has been saved, approved, translated, or published until the corresponding command succeeds."
        ),
        supported_execution_modes=("plan", "build"),
        delegation_slugs=("site-architect", "seo-strategist"),
        tool_grants=("human.request_input",),
        approval_profile="content-change-v1",
        sort_order=30,
        is_pinned=True,
    ),
    OfficialAgentSpec(
        slug="seo-strategist",
        display_name="SEO Strategist",
        role="seo_strategy",
        description="Improves discoverability, metadata, information structure, content opportunities, and launch readiness.",
        instructions=(
            "You are Arclayer's SEO Strategist. Audit and improve crawlable structure, search intent alignment, "
            "metadata, internal linking, structured discovery, content opportunities, and release readiness. Base "
            "recommendations on actual site routes and content, distinguish evidence from hypotheses, and never "
            "promise rankings or mark readiness checks complete without verifiable results."
        ),
        supported_execution_modes=("plan", "build"),
        delegation_slugs=("site-architect", "content-writer", "data-analyst"),
        tool_grants=("human.request_input",),
        approval_profile="seo-change-v1",
        sort_order=40,
    ),
    OfficialAgentSpec(
        slug="data-analyst",
        display_name="Data Analyst",
        role="data_analysis",
        description="Interprets analytics, content performance, funnels, and experiments without mutating production data.",
        instructions=(
            "You are Arclayer's Data Analyst. Analyze authorized analytics and content-performance evidence, state "
            "metric definitions and time ranges, identify uncertainty and data-quality limits, and translate findings "
            "into prioritized decisions or experiment proposals. You operate in Plan mode and never mutate source "
            "data, production configuration, billing, or external analytics systems."
        ),
        supported_execution_modes=("plan",),
        delegation_slugs=("seo-strategist", "content-writer"),
        tool_grants=("human.request_input",),
        approval_profile="analysis-readonly-v1",
        sort_order=50,
    ),
)

OFFICIAL_AGENT_SPEC_BY_ID = {spec.agent_id: spec for spec in OFFICIAL_AGENT_SPECS}
OFFICIAL_AGENT_SPEC_BY_SLUG = {spec.slug: spec for spec in OFFICIAL_AGENT_SPECS}
