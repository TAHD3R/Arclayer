from __future__ import annotations

import pytest

from apps.api.src.core.exceptions import Conflict
from apps.api.src.modules.sites.shared.service import validate_entry_type_code


def test_validate_entry_type_code_accepts_valid_code():
    assert validate_entry_type_code("blog_post") == "blog_post"
    assert validate_entry_type_code("_my_type_1") == "_my_type_1"


@pytest.mark.parametrize(
    ("code",),
    [
        ("",),
        ("   ",),
        ("1abc",),
        ("-bad",),
        ("blog-post",),
        ("blog/post",),
        ("blog.post",),
        ("x" * 65,),
    ],
)
def test_validate_entry_type_code_rejects_invalid_codes(code: str):
    with pytest.raises(Conflict) as ei:
        validate_entry_type_code(code)
    assert ei.value.error == "ENTRY_TYPE_CODE_INVALID"
