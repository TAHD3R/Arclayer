from src.modules.workspaces.skills.official_catalog_source import OfficialSkillAsset

OFFICIAL_SKILL_ASSETS: tuple[OfficialSkillAsset, ...] = (
    OfficialSkillAsset(
        stable_key="arclayer.sitemap-planning",
        slug="sitemap-planning",
        display_name_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_NAME",
        description_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_DESC",
        name="Sitemap Planning",
        description="Turns a site brief into a reviewable information architecture and page hierarchy.",
        semantic_version="1.0.0",
        capability_tags=("site.sitemap", "site.information-architecture"),
        instructions="""# Sitemap Planning

Create a decision-ready sitemap from the supplied product brief and workspace evidence.

## Required output

1. State the audience, primary conversion goal, and evidence used.
2. Produce a hierarchical page tree with one stable page key per page.
3. For every page, state its job, primary audience intent, and primary action.
4. Identify shared navigation groups and utility pages separately.
5. Mark assumptions and unresolved product decisions explicitly.

Do not invent company facts, analytics, customer claims, legal requirements, or content inventory. Do not write final page copy or visual styles. Prefer the smallest coherent structure that covers the verified user journeys.""",
        expected_checksum="sha256:0f8c347ad1390f0f655d17017e797d3c3e797616d2e83dc7b3674a4648df7907",
    ),
    OfficialSkillAsset(
        stable_key="arclayer.wireframe-architecture",
        slug="wireframe-architecture",
        display_name_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_WIREFRAME_NAME",
        description_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_WIREFRAME_DESC",
        name="Wireframe Architecture",
        description="Defines page sections, content responsibilities, and responsive hierarchy before styling.",
        semantic_version="1.0.0",
        capability_tags=("site.wireframe", "site.content-hierarchy"),
        instructions="""# Wireframe Architecture

Translate an approved sitemap page into a structural wireframe specification.

## Required output

1. Preserve the page goal, audience intent, and primary action.
2. List sections in reading order with a stable section key and one responsibility each.
3. For every section, define required content, interaction, proof, and exit path.
4. Describe desktop and narrow-screen hierarchy without fixed pixel layouts.
5. Mark reusable patterns and page-specific sections.
6. Surface missing evidence or unresolved content dependencies.

Do not select colors, fonts, illustration styles, or final component implementations. Do not hide missing content behind generic filler. Every section must earn its place in the user journey.""",
        expected_checksum="sha256:af7919752ce1061ec2d4d1359ffc7cf95e18e63c1f596fd3d2ce65fb10a8023d",
    ),
    OfficialSkillAsset(
        stable_key="arclayer.style-guide-direction",
        slug="style-guide-direction",
        display_name_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_STYLE_NAME",
        description_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_STYLE_DESC",
        name="Style Guide Direction",
        description="Converts brand evidence into accessible visual and editorial design rules.",
        semantic_version="1.0.0",
        capability_tags=("site.style-guide", "brand.system"),
        instructions="""# Style Guide Direction

Create a constrained style-guide direction from approved brand and product evidence.

## Required output

1. Separate verified brand facts from proposed design decisions.
2. Define typography roles, spacing rhythm, shape language, and one restrained accent strategy.
3. Define semantic color roles with light and dark surface requirements.
4. Define editorial voice rules with concrete do and do-not examples.
5. State accessibility constraints for contrast, focus, motion, text sizing, and target size.
6. Name the decisions that still require human approval.

Do not fabricate a logo, trademark rule, font license, or brand history. Avoid generic trend language. Prefer a small token system that can be implemented consistently across real pages.""",
        expected_checksum="sha256:b2a9d31024f3f67e3f72753ee36cd334033abffe1a63f6ea971f0c5399cb325b",
    ),
    OfficialSkillAsset(
        stable_key="arclayer.interface-design-review",
        slug="interface-design-review",
        display_name_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_DESIGN_NAME",
        description_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_DESIGN_DESC",
        name="Interface Design Review",
        description="Reviews page design against the approved wireframe, style guide, and product intent.",
        semantic_version="1.0.0",
        capability_tags=("site.design", "site.quality-review"),
        instructions="""# Interface Design Review

Review a proposed page design against its approved sitemap, wireframe, style guide, and content evidence.

## Required output

1. Confirm whether the primary user goal and action remain visually dominant.
2. Check content hierarchy, scanning order, responsive behavior, and reusable pattern consistency.
3. Check semantic color use, typography roles, spacing rhythm, focus visibility, and reduced motion.
4. Identify unsupported copy, missing proof, ambiguous controls, and decorative elements that weaken comprehension.
5. Rank findings by user impact and provide a concrete correction for each finding.
6. Preserve intentional design decisions that already satisfy the contract.

Do not replace evidence with aesthetic preference. Do not recommend novelty that conflicts with the approved system. Treat accessibility and responsive behavior as product requirements.""",
        expected_checksum="sha256:72922f30e23dd64e5a16b8e00237d2df45fb48e95089f7558e35d24f1045b439",
    ),
    OfficialSkillAsset(
        stable_key="arclayer.editorial-drafting",
        slug="editorial-drafting",
        display_name_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EDITORIAL_NAME",
        description_key="SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EDITORIAL_DESC",
        name="Editorial Drafting",
        description="Produces evidence-grounded article drafts with explicit claims, structure, and review gaps.",
        semantic_version="1.0.0",
        capability_tags=("content.editorial", "content.blog"),
        instructions="""# Editorial Drafting

Draft an article from the approved brief, sources, content model, and editorial rules supplied in context.

## Required output

1. Restate the audience, search or reader intent, and article promise.
2. Propose a concise outline before the full draft.
3. Tie factual claims to supplied evidence and mark claims that still need a source.
4. Use descriptive headings, direct language, and concrete examples.
5. Provide title, summary, body, suggested metadata, and an explicit review checklist.
6. Preserve structured fields instead of collapsing everything into prose.

Do not invent quotations, metrics, customer stories, product capabilities, or citations. Do not publish or claim approval. If evidence is insufficient, expose the gap in the draft instead of silently filling it.""",
        expected_checksum="sha256:ad1f354c263375313167487a79b3a0d97e70aaa29207dbc9cfbc98a0f0326334",
    ),
)
