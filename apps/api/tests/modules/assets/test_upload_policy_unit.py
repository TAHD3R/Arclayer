from __future__ import annotations

import pytest

from apps.api.core.exceptions import BadRequest
from apps.api.modules.assets.admin.uploads.policy import (
    UploadPolicy,
    build_upload_policy,
    normalize_original_filename,
    validate_sha256_hex,
    validate_upload_metadata,
)


def _policy_for(purpose: str) -> UploadPolicy:
    # Keep numbers small for tests.
    return build_upload_policy(
        purpose=purpose,
        global_max_size_bytes=100,
        max_avatar_size_bytes=10,
        max_site_logo_size_bytes=20,
        max_favicon_size_bytes=5,
    )


def test_normalize_original_filename_rejects_paths() -> None:
    with pytest.raises(BadRequest):
        normalize_original_filename("../x.png")
    with pytest.raises(BadRequest):
        normalize_original_filename("a/b.png")
    with pytest.raises(BadRequest):
        normalize_original_filename("a\\b.png")


def test_validate_sha256_hex_normalizes_lowercase() -> None:
    v = validate_sha256_hex("A" * 64)
    assert v == "a" * 64


def test_validate_sha256_hex_rejects_non_hex() -> None:
    with pytest.raises(BadRequest) as exc:
        validate_sha256_hex("g" * 64)
    assert exc.value.error == "UPLOAD_SHA256_INVALID"


def test_avatar_policy_allows_images_only() -> None:
    policy = _policy_for("avatar")
    ext = validate_upload_metadata(purpose="avatar", filename="a.png", size_bytes=1, policy=policy)
    assert ext == "png"

    with pytest.raises(BadRequest) as exc:
        validate_upload_metadata(purpose="avatar", filename="a.pdf", size_bytes=1, policy=policy)
    assert exc.value.error == "UPLOAD_TYPE_NOT_ALLOWED"


def test_favicon_policy_allows_ico_png_only() -> None:
    policy = _policy_for("favicon")
    assert validate_upload_metadata(purpose="favicon", filename="a.ico", size_bytes=1, policy=policy) == "ico"
    assert validate_upload_metadata(purpose="favicon", filename="a.png", size_bytes=1, policy=policy) == "png"

    with pytest.raises(BadRequest):
        validate_upload_metadata(purpose="favicon", filename="a.jpg", size_bytes=1, policy=policy)


def test_library_policy_allows_common_types_but_not_svg() -> None:
    policy = _policy_for("library")
    assert validate_upload_metadata(purpose="library", filename="a.png", size_bytes=1, policy=policy) == "png"
    assert validate_upload_metadata(purpose="library", filename="a.zip", size_bytes=1, policy=policy) == "zip"
    assert validate_upload_metadata(purpose="library", filename="a.pdf", size_bytes=1, policy=policy) == "pdf"
    assert validate_upload_metadata(purpose="library", filename="a.mp4", size_bytes=1, policy=policy) == "mp4"
    assert validate_upload_metadata(purpose="library", filename="a.woff2", size_bytes=1, policy=policy) == "woff2"

    with pytest.raises(BadRequest):
        validate_upload_metadata(purpose="library", filename="a.svg", size_bytes=1, policy=policy)


def test_policy_enforces_purpose_size_cap() -> None:
    policy = _policy_for("avatar")
    with pytest.raises(BadRequest) as exc:
        validate_upload_metadata(purpose="avatar", filename="a.png", size_bytes=11, policy=policy)
    assert exc.value.error == "UPLOAD_TOO_LARGE"
