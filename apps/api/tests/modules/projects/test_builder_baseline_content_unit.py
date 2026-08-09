from __future__ import annotations

import pytest

from src.modules.projects.builder.baseline_content import _official_model_contract


@pytest.mark.parametrize(
    ("key", "plural", "category"),
    [
        ("page", "pages", "site_builder"),
        ("article", "articles", "content_library"),
        ("reusable-section", "reusable-sections", "site_builder"),
    ],
)
def test_builder_baseline_uses_official_content_protocols(key: str, plural: str, category: str) -> None:
    contract = _official_model_contract(key)

    assert contract.singular_key == key
    assert contract.plural_key == plural
    assert contract.category == category
    assert "versioned" in contract.capabilities
    assert contract.workflow.initial_state == "draft"
