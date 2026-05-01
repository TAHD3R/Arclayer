from __future__ import annotations

import pytest

from src.core.exceptions import BadRequest


def test_image_transform_params_normalize_aliases_and_cache_token() -> None:
    from src.platform.assets.images import ImageTransformParams

    params = ImageTransformParams.model_validate({
        "w": 320,
        "h": 180,
        "fit": "fill",
        "fm": "jpeg",
        "q": 72,
    }).ensure_requested()

    assert params is not None
    assert params.width == 320
    assert params.height == 180
    assert params.fit == "fill"
    assert params.format == "jpg"
    assert params.quality == 72
    assert params.canonical_token() == "w320_h180_fit-fill_fm-jpg_q72"


def test_image_transform_requires_dimension_when_format_only() -> None:
    from src.platform.assets.images import ImageTransformParams

    with pytest.raises(BadRequest) as exc:
        ImageTransformParams(format="webp").ensure_requested()

    assert exc.value.error == "ASSET_IMAGE_TRANSFORM_INVALID"


def test_image_transform_cache_key_uses_source_version_and_params() -> None:
    from src.platform.assets.images import ImageTransformParams, derive_image_transform_object_key

    params = ImageTransformParams(width=320, format="webp").ensure_requested()
    assert params is not None

    key_a = derive_image_transform_object_key(
        source_object_key="projects/demo/assets/source.png",
        source_version="sha-a",
        params=params,
    )
    key_b = derive_image_transform_object_key(
        source_object_key="projects/demo/assets/source.png",
        source_version="sha-b",
        params=params,
    )

    assert key_a.startswith("transforms/")
    assert key_a.endswith("/w320_fit-scale_fm-webp.webp")
    assert key_a != key_b


@pytest.mark.asyncio
async def test_transform_image_to_path_resizes_and_reuses_cache(tmp_path) -> None:
    from PIL import Image

    from src.platform.assets.images import ImageTransformParams, transform_image_to_path

    source = tmp_path / "source.png"
    output = tmp_path / "cache" / "out.jpg"
    Image.new("RGB", (640, 320), color=(20, 120, 220)).save(source, format="PNG")
    params = ImageTransformParams(width=160, format="jpg", quality=70).ensure_requested()
    assert params is not None

    first = await transform_image_to_path(
        source_path=source,
        output_path=output,
        output_object_key="transforms/demo/out.jpg",
        params=params,
        source_ext="png",
    )
    second = await transform_image_to_path(
        source_path=source,
        output_path=output,
        output_object_key="transforms/demo/out.jpg",
        params=params,
        source_ext="png",
    )

    assert first.width == 160
    assert first.height == 80
    assert first.content_type == "image/jpeg"
    assert first.cache_hit is False
    assert second.cache_hit is True
