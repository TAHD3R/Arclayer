from uuid import UUID

from src.modules.ai.agent_catalog_manifest import official_agent_id, official_agent_version_id

TEST_LEAD_AGENT_ID = official_agent_id("arclayer-coordinator")
TEST_LEAD_AGENT_VERSION_ID = official_agent_version_id("arclayer-coordinator", 1)
TEST_LEAD_AGENT_ASSIGNMENT_ID = UUID("d6d6e5a4-6caa-4e5f-8b31-2c3d4e5f6a01")

TEST_MENTIONED_AGENT_ID = official_agent_id("content-writer")
TEST_MENTIONED_AGENT_VERSION_ID = official_agent_version_id("content-writer", 1)
TEST_MENTIONED_AGENT_ASSIGNMENT_ID = UUID("d6d6e5a4-6caa-4e5f-8b31-2c3d4e5f6a02")
