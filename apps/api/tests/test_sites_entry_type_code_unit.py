from __future__ import annotations

import pytest

from apps.api.core.exceptions import Conflict
from apps.api.routers.v1.sites.service import _validate_entry_type_code


def test_validate_entry_type_code_accepts_valid_code():
    assert _validate_entry_type_code("blog_post") == "blog_post"
    assert _validate_entry_type_code("_my_type_1") == "_my_type_1"


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
        _validate_entry_type_code(code)
    assert ei.value.error == "ENTRY_TYPE_CODE_INVALID"
