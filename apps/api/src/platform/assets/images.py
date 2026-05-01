from __future__ import annotations

import asyncio
import hashlib
from enum import StrEnum
from io import BytesIO
from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.core.exceptions import BadRequest
from src.core.i18n import t

IMAGE_TRANSFORM_CACHE_CONTROL = "public, max-age=31536000, immutable"
MAX_IMAGE_TRANSFORM_DIMENSION = 4096
MAX_IMAGE_TRANSFORM_PIXELS = 16_777_216
MIN_IMAGE_TRANSFORM_QUALITY = 1
MAX_IMAGE_TRANSFORM_QUALITY = 100
DEFAULT_IMAGE_TRANSFORM_QUALITY = 85


class ImageTransformFit(StrEnum):
    SCALE = "scale"
    FILL = "fill"
    PAD = "pad"


class ImageTransformFormat(StrEnum):
    JPEG = "jpg"
    PNG = "png"
    WEBP = "webp"


class ImageTransformParams(BaseSchema):
    model_config = ConfigDict(frozen=True)

    width: Annotated[
        int | None,
        Field(default=None, ge=1, le=MAX_IMAGE_TRANSFORM_DIMENSION, validation_alias=AliasChoices("width", "w")),
    ] = None
    height: Annotated[
        int | None,
        Field(default=None, ge=1, le=MAX_IMAGE_TRANSFORM_DIMENSION, validation_alias=AliasChoices("height", "h")),
    ] = None
    fit: ImageTransformFit | str = ImageTransformFit.SCALE
    format: Annotated[
        ImageTransformFormat | str | None,
        Field(default=None, validation_alias=AliasChoices("format", "fm")),
    ] = None
    quality: Annotated[
        int | None,
        Field(
            default=None,
            ge=MIN_IMAGE_TRANSFORM_QUALITY,
            le=MAX_IMAGE_TRANSFORM_QUALITY,
            validation_alias=AliasChoices("quality", "q"),
        ),
    ] = None

    @field_validator("format", mode="before")
    @classmethod
    def _normalize_format(cls, value: object) -> object:
        if value is None:
            return None
        normalized = str(value).strip().lower()
        if normalized == "jpeg":
            return ImageTransformFormat.JPEG
        return normalized

    @field_validator("width", "height", mode="before")
    @classmethod
    def _empty_dimension_is_none(cls, value: object) -> object:
        if value == "":
            return None
        return value

    @field_validator("quality", mode="before")
    @classmethod
    def _empty_quality_is_none(cls, value: object) -> object:
        if value == "":
            return None
        return value

    def ensure_requested(self) -> ImageTransformParams | None:
        if self.width is None and self.height is None and self.format is None and self.quality is None:
            return None
        if self.width is None and self.height is None:
            raise BadRequest(
                message=t("errors", "ASSET_IMAGE_TRANSFORM_DIMENSION_REQUIRED"),
                error="ASSET_IMAGE_TRANSFORM_INVALID",
            )
        if self.width is not None and self.height is not None:
            pixels = int(self.width) * int(self.height)
            if pixels > MAX_IMAGE_TRANSFORM_PIXELS:
                raise BadRequest(
                    message=t("errors", "ASSET_IMAGE_TRANSFORM_TOO_LARGE"),
                    error="ASSET_IMAGE_TRANSFORM_INVALID",
                    details={
                        "maxPixels": MAX_IMAGE_TRANSFORM_PIXELS,
                        "requestedPixels": pixels,
                    },
                )
        return self

    @property
    def output_quality(self) -> int:
        return self.quality or DEFAULT_IMAGE_TRANSFORM_QUALITY

    def canonical_token(self) -> str:
        parts = []
        if self.width is not None:
            parts.append(f"w{self.width}")
        if self.height is not None:
            parts.append(f"h{self.height}")
        parts.append(f"fit-{_enum_value(self.fit)}")
        if self.format is not None:
            parts.append(f"fm-{_enum_value(self.format)}")
        if self.quality is not None:
            parts.append(f"q{self.quality}")
        return "_".join(parts)


class ImageTransformResult(BaseSchema):
    model_config = ConfigDict(frozen=True)

    path: Path
    object_key: str
    width: int
    height: int
    content_type: str
    cache_hit: bool


def has_image_transform_request(params: ImageTransformParams | None) -> bool:
    if params is None:
        return False
    return params.ensure_requested() is not None


def image_transform_output_mime(format: ImageTransformFormat) -> str:
    normalized = _enum_value(format)
    if normalized == ImageTransformFormat.PNG.value:
        return "image/png"
    if normalized == ImageTransformFormat.WEBP.value:
        return "image/webp"
    return "image/jpeg"


def image_transform_output_ext(format: ImageTransformFormat) -> str:
    normalized = _enum_value(format)
    return "jpg" if normalized == ImageTransformFormat.JPEG.value else normalized


def derive_image_transform_object_key(
    *,
    source_object_key: str,
    source_version: str,
    params: ImageTransformParams,
) -> str:
    source_hash = hashlib.sha256(f"{source_object_key}:{source_version}".encode()).hexdigest()[:16]
    ext = image_transform_output_ext(resolve_output_format(params=params, source_ext=Path(source_object_key).suffix))
    return f"transforms/{source_hash}/{params.canonical_token()}.{ext}"


def resolve_output_format(*, params: ImageTransformParams, source_ext: str | None) -> ImageTransformFormat:
    if params.format is not None:
        return ImageTransformFormat(_enum_value(params.format))
    normalized = (source_ext or "").strip().lower().lstrip(".")
    if normalized in {"jpg", "jpeg"}:
        return ImageTransformFormat.JPEG
    if normalized == "webp":
        return ImageTransformFormat.WEBP
    return ImageTransformFormat.PNG


def _enum_value(value: StrEnum | str) -> str:
    return value.value if isinstance(value, StrEnum) else str(value)


async def transform_image_to_path(
    *,
    source_path: Path,
    output_path: Path,
    output_object_key: str,
    params: ImageTransformParams,
    source_ext: str | None,
) -> ImageTransformResult:
    return await asyncio.to_thread(
        _transform_image_to_path_sync,
        source_path=source_path,
        output_path=output_path,
        output_object_key=output_object_key,
        params=params,
        source_ext=source_ext,
    )


def _transform_image_to_path_sync(
    *,
    source_path: Path,
    output_path: Path,
    output_object_key: str,
    params: ImageTransformParams,
    source_ext: str | None,
) -> ImageTransformResult:
    from PIL import Image, ImageOps, UnidentifiedImageError  # type: ignore[import-not-found]

    resolved_format = resolve_output_format(params=params, source_ext=source_ext)
    content_type = image_transform_output_mime(resolved_format)
    if output_path.is_file():
        with Image.open(output_path) as cached:
            return ImageTransformResult(
                path=output_path,
                object_key=output_object_key,
                width=int(cached.width),
                height=int(cached.height),
                content_type=content_type,
                cache_hit=True,
            )

    try:
        with Image.open(source_path) as image:
            image = ImageOps.exif_transpose(image)
            transformed = _resize_image(image, params=params)
            encoded = _encode_image(transformed, format=resolved_format, quality=params.output_quality)
    except UnidentifiedImageError as exc:
        raise BadRequest(
            message=t("errors", "ASSET_IMAGE_TRANSFORM_SOURCE_INVALID"),
            error="ASSET_IMAGE_TRANSFORM_INVALID",
        ) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(encoded)

    with Image.open(output_path) as saved:
        return ImageTransformResult(
            path=output_path,
            object_key=output_object_key,
            width=int(saved.width),
            height=int(saved.height),
            content_type=content_type,
            cache_hit=False,
        )


def _resize_image(image, *, params: ImageTransformParams):  # type: ignore[no-untyped-def]
    from PIL import Image, ImageOps  # type: ignore[import-not-found]

    target_width, target_height = _resolve_target_size(image.width, image.height, params=params)
    fit = ImageTransformFit(_enum_value(params.fit))
    if fit == ImageTransformFit.FILL and params.width is not None and params.height is not None:
        return ImageOps.fit(image, (target_width, target_height), method=Image.Resampling.LANCZOS)

    resized = image.copy()
    resized.thumbnail((target_width, target_height), resample=Image.Resampling.LANCZOS)
    if fit != ImageTransformFit.PAD or params.width is None or params.height is None:
        return resized

    canvas = Image.new("RGBA", (target_width, target_height), (255, 255, 255, 0))
    left = max(0, (target_width - int(resized.width)) // 2)
    top = max(0, (target_height - int(resized.height)) // 2)
    canvas.alpha_composite(resized.convert("RGBA"), dest=(left, top))
    return canvas


def _resolve_target_size(source_width: int, source_height: int, *, params: ImageTransformParams) -> tuple[int, int]:
    width = params.width
    height = params.height
    if width is None and height is None:
        return source_width, source_height
    if width is None:
        ratio = int(height or source_height) / source_height
        return max(1, int(round(source_width * ratio))), int(height or source_height)
    if height is None:
        ratio = int(width) / source_width
        return int(width), max(1, int(round(source_height * ratio)))
    return int(width), int(height)


def _encode_image(image, *, format: ImageTransformFormat, quality: int) -> bytes:  # type: ignore[no-untyped-def]
    out = BytesIO()
    if format == ImageTransformFormat.PNG:
        if image.mode not in {"RGBA", "LA", "RGB", "L"}:
            image = image.convert("RGBA")
        image.save(out, format="PNG", optimize=True)
        return out.getvalue()

    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    if format == ImageTransformFormat.WEBP:
        image.save(out, format="WEBP", quality=int(quality), method=6)
    else:
        image.save(out, format="JPEG", quality=int(quality), optimize=True, progressive=True)
    return out.getvalue()
