from __future__ import annotations

from typing import Final, Literal

from src.modules.system.skills.schema import PlatformSkillCatalogOptionOut

Risk = Literal["low", "medium", "high"]


def _option(
    identifier: str,
    label: str,
    description: str,
    risk: Risk,
    *,
    available: bool = True,
) -> PlatformSkillCatalogOptionOut:
    return PlatformSkillCatalogOptionOut(
        id=identifier,
        label=label,
        description=description,
        risk=risk,
        available=available,
    )


SUPPORTED_TOOLS: Final[tuple[PlatformSkillCatalogOptionOut, ...]] = (
    _option("human.request_input", "Human input", "Pause a run and ask the operator for an answer.", "medium"),
    _option(
        "builder.sitemap.generate",
        "Generate sitemap",
        "Plan a site information architecture without applying changes.",
        "low",
    ),
    _option("builder.sitemap.preview", "Preview sitemap", "Render the proposed sitemap for review.", "low"),
    _option("builder.sitemap.apply", "Apply sitemap", "Write an approved sitemap change to the project.", "high"),
    _option(
        "builder.style_guide.generate",
        "Generate style guide",
        "Create a style guide proposal from project context.",
        "low",
    ),
    _option(
        "builder.wireframe.generate", "Generate wireframe", "Create a wireframe proposal without publishing it.", "low"
    ),
    _option("builder.wireframe.apply", "Apply wireframe", "Write an approved wireframe change to the project.", "high"),
    _option("builder.design.generate", "Generate design", "Create a visual design proposal for review.", "low"),
    _option("builder.design.apply", "Apply design", "Write an approved design change to the project.", "high"),
    _option(
        "workspace.skill.create", "Create workspace Skill", "Create a Skill package in the active workspace.", "high"
    ),
)

PERMISSIONS: Final[tuple[PlatformSkillCatalogOptionOut, ...]] = (
    _option("content.read", "Read content", "Read content available to the active workspace.", "low"),
    _option("content.write", "Write content", "Create or update content in the active workspace.", "high"),
    _option("settings.read", "Read settings", "Read non-secret workspace settings.", "medium"),
    _option("settings.write", "Write settings", "Update workspace settings after authorization.", "high"),
    _option("models.read", "Read model catalog", "Read the platform model catalog and availability.", "low"),
    _option("delivery.read", "Read delivery status", "Read project delivery and deployment status.", "medium"),
    _option("graphql.read", "Read GraphQL data", "Read data exposed through the workspace GraphQL boundary.", "medium"),
    _option("keys.read", "Read key metadata", "Read masked provider key metadata, never secret values.", "high"),
    _option("keys.write", "Write provider keys", "Create, rotate, or revoke provider credentials.", "high"),
)

EGRESS_DESTINATIONS: Final[tuple[PlatformSkillCatalogOptionOut, ...]] = (
    _option(
        "api.example.com",
        "Approved API endpoint",
        "Platform-approved external API destination; requires egress policy.",
        "high",
    ),
)

DATA_CLASSES: Final[tuple[PlatformSkillCatalogOptionOut, ...]] = (
    _option("content.public", "Public content", "Content already marked public by the workspace.", "low"),
    _option(
        "content.editorial", "Editorial content", "Draft or editorial content that may not be published.", "medium"
    ),
    _option("content.publish", "Publishing metadata", "Data needed to prepare or execute a publication.", "high"),
    _option(
        "analytics.aggregate", "Aggregate analytics", "Aggregated metrics without individual event payloads.", "low"
    ),
    _option("aggregate.metrics", "Aggregate metrics", "Non-identifying aggregate operational metrics.", "low"),
)

CAPABILITY_TAGS: Final[tuple[PlatformSkillCatalogOptionOut, ...]] = (
    _option("accessibility", "Accessibility", "Skill focuses on accessible product experiences.", "low"),
    _option("review", "Review", "Skill produces reviewable proposals before mutation.", "low"),
    _option("frontend", "Frontend", "Skill operates on frontend structure or presentation.", "medium"),
    _option("editorial", "Editorial", "Skill operates on editorial content workflows.", "medium"),
    _option("analytics", "Analytics", "Skill operates on aggregate analytics workflows.", "low"),
)

REFERENCE_MIME_TYPES: Final[tuple[PlatformSkillCatalogOptionOut, ...]] = (
    _option("text/markdown", "Markdown", "Human-readable reference or instruction text.", "low"),
    _option("text/plain", "Plain text", "Unformatted human-readable reference text.", "low"),
    _option("application/json", "JSON", "Structured inert reference data; must be valid JSON.", "medium"),
)


def ids(options: tuple[PlatformSkillCatalogOptionOut, ...]) -> frozenset[str]:
    return frozenset(option.id for option in options if option.available)
