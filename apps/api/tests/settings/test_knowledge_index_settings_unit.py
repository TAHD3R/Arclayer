from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config import Settings


def test_knowledge_index_profile_is_explicit_and_disabled_by_default(tmp_path) -> None:
    settings = Settings(
        app_env="test",
        database={"enabled": False},
        storage={
            "local_root_dir": tmp_path / "objects",
            "local_tmp_dir": tmp_path / "scratch",
        },
    )

    assert settings.knowledge_index.enabled is False
    assert settings.knowledge_index.embedding_provider == "litellm"
    assert settings.knowledge_index.embedding_model == "text-embedding-3-small"
    assert settings.knowledge_index.vector_dimensions == 1536
    assert settings.knowledge_index.index_backend == "meilisearch"
    assert settings.knowledge_index.index_prefix == "arclayer_knowledge"
    assert settings.knowledge_index.embedder_name == "knowledge-default"


def test_knowledge_index_profile_rejects_invalid_provider_dimensions_and_uid_prefix(
    tmp_path,
) -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="test",
            database={"enabled": False},
            storage={
                "local_root_dir": tmp_path / "objects",
                "local_tmp_dir": tmp_path / "scratch",
            },
            knowledge_index={
                "enabled": True,
                "embedding_provider": "unknown",
                "vector_dimensions": 0,
                "index_prefix": "invalid index prefix",
            },
        )
