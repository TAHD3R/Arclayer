from __future__ import annotations

import subprocess

import pytest
from imageio_ffmpeg import get_ffmpeg_exe
from PIL import Image

from src.platform.assets.thumbnails import (
    PreviewRendererTemporarilyUnavailableError,
    PreviewSourceInvalidError,
    _render_pdf_preview_source_sync,
    _render_video_preview_source_sync,
    generate_image_thumbnails,
)


@pytest.mark.asyncio
async def test_generate_image_thumbnails_deduplicates_natural_width(tmp_path) -> None:
    source = tmp_path / "source.png"
    Image.new("RGB", (300, 200), color="navy").save(source)
    outputs = tmp_path / "outputs"

    variants, _ = await generate_image_thumbnails(
        in_path=source,
        out_path_for_width=lambda width, *, alpha: (
            outputs / f"thumb-{width}.{'png' if alpha else 'jpg'}",
            f"thumb-{width}.{'png' if alpha else 'jpg'}",
        ),
        widths=[400, 800, 1200, 1600],
    )

    assert [(item["width"], item["object_key"]) for item in variants["thumbnails"]] == [(300, "thumb-300.jpg")]


@pytest.mark.asyncio
async def test_truncated_image_decode_oserror_is_invalid_source(tmp_path) -> None:
    source = tmp_path / "truncated.png"
    complete = tmp_path / "complete.png"
    Image.new("RGB", (300, 200), color="navy").save(complete)
    payload = complete.read_bytes()
    source.write_bytes(payload[: len(payload) // 2])

    with pytest.raises(PreviewSourceInvalidError):
        await generate_image_thumbnails(
            in_path=source,
            out_path_for_width=lambda width, *, alpha: (
                tmp_path / "outputs" / f"thumb-{width}.{'png' if alpha else 'jpg'}",
                f"thumb-{width}.{'png' if alpha else 'jpg'}",
            ),
            widths=[400],
        )


@pytest.mark.parametrize(
    "read_error",
    [
        PermissionError("scratch source permission denied"),
        OSError(5, "scratch filesystem input/output error"),
    ],
)
@pytest.mark.asyncio
async def test_image_scratch_read_oserror_is_renderer_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    read_error: OSError,
) -> None:
    source = tmp_path / "source.png"
    Image.new("RGB", (300, 200), color="navy").save(source)

    def _read_failure(_path):  # type: ignore[no-untyped-def]
        raise read_error

    monkeypatch.setattr(Image, "open", _read_failure)

    with pytest.raises(PreviewRendererTemporarilyUnavailableError) as exc_info:
        await generate_image_thumbnails(
            in_path=source,
            out_path_for_width=lambda width, *, alpha: (
                tmp_path / "outputs" / f"thumb-{width}.{'png' if alpha else 'jpg'}",
                f"thumb-{width}.{'png' if alpha else 'jpg'}",
            ),
            widths=[400],
        )

    assert exc_info.value.__cause__ is read_error


@pytest.mark.asyncio
async def test_image_output_parent_io_failure_is_renderer_unavailable(tmp_path) -> None:
    source = tmp_path / "source.png"
    Image.new("RGB", (300, 200), color="navy").save(source)
    blocked_parent = tmp_path / "blocked"
    blocked_parent.write_bytes(b"not-a-directory")

    with pytest.raises(PreviewRendererTemporarilyUnavailableError):
        await generate_image_thumbnails(
            in_path=source,
            out_path_for_width=lambda width, *, alpha: (
                blocked_parent / f"thumb-{width}.{'png' if alpha else 'jpg'}",
                f"thumb-{width}.{'png' if alpha else 'jpg'}",
            ),
            widths=[400],
        )


@pytest.mark.asyncio
async def test_image_save_io_failure_is_renderer_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    source = tmp_path / "source.png"
    Image.new("RGB", (300, 200), color="navy").save(source)

    def _save_failure(self, fp, format=None, **params):  # type: ignore[no-untyped-def]
        _ = self, fp, format, params
        raise OSError("output filesystem unavailable")

    monkeypatch.setattr(Image.Image, "save", _save_failure)

    with pytest.raises(PreviewRendererTemporarilyUnavailableError):
        await generate_image_thumbnails(
            in_path=source,
            out_path_for_width=lambda width, *, alpha: (
                tmp_path / "outputs" / f"thumb-{width}.{'png' if alpha else 'jpg'}",
                f"thumb-{width}.{'png' if alpha else 'jpg'}",
            ),
            widths=[400],
        )


def test_render_pdf_preview_source(tmp_path) -> None:
    pdf = tmp_path / "sample.pdf"
    out = tmp_path / "preview.png"
    pdf.write_bytes(
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]/Contents 4 0 R"
        b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        b"4 0 obj<</Length 44>>stream\n"
        b"BT /F1 12 Tf 10 36 Td (PDF Preview) Tj ET\n"
        b"endstream endobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"xref\n"
        b"0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000056 00000 n \n"
        b"0000000111 00000 n \n"
        b"0000000212 00000 n \n"
        b"0000000305 00000 n \n"
        b"trailer<</Size 6/Root 1 0 R>>\n"
        b"startxref\n"
        b"375\n"
        b"%%EOF\n"
    )

    meta = _render_pdf_preview_source_sync(in_path=pdf, out_path=out)

    assert out.is_file()
    assert out.stat().st_size > 0
    assert meta == {"document": {"preview_source": "first_page"}}


def test_pdf_preview_classifies_malformed_document_as_invalid_source(tmp_path) -> None:
    source = tmp_path / "invalid.pdf"
    source.write_bytes(b"not-a-pdf")

    with pytest.raises(PreviewSourceInvalidError):
        _render_pdf_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )


def test_pdf_preview_classifies_renderer_io_failure_as_temporarily_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    import pypdfium2

    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4")

    def _renderer_failure(_path: str):  # type: ignore[no-untyped-def]
        raise OSError("PDFium shared library unavailable")

    monkeypatch.setattr(pypdfium2, "PdfDocument", _renderer_failure)

    with pytest.raises(PreviewRendererTemporarilyUnavailableError) as exc_info:
        _render_pdf_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )

    assert isinstance(exc_info.value.__cause__, OSError)


def test_render_video_preview_source(tmp_path) -> None:
    video = tmp_path / "sample.mp4"
    out = tmp_path / "preview.png"
    ffmpeg = get_ffmpeg_exe()
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=64x64:d=1",
            "-pix_fmt",
            "yuv420p",
            str(video),
        ],
        check=True,
    )

    meta = _render_video_preview_source_sync(in_path=video, out_path=out)

    assert out.is_file()
    assert out.stat().st_size > 0
    assert meta["video"]["preview_source"] == "frame"


def test_video_preview_classifies_ffmpeg_rejection_as_invalid_source(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    import imageio_ffmpeg

    import src.platform.assets.thumbnails as thumbnails_module

    source = tmp_path / "invalid.mp4"
    source.write_bytes(b"not-a-video")
    monkeypatch.setattr(imageio_ffmpeg, "get_ffmpeg_exe", lambda: "ffmpeg")
    monkeypatch.setattr(
        thumbnails_module.subprocess,
        "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            args=["ffmpeg"],
            returncode=1,
            stdout="",
            stderr="invalid media payload",
        ),
    )

    with pytest.raises(PreviewSourceInvalidError) as exc_info:
        _render_video_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )

    assert str(exc_info.value) == "ffmpeg could not decode the video source"
    assert "invalid media payload" not in str(exc_info.value)


def test_video_preview_classifies_negative_ffmpeg_return_as_renderer_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    import imageio_ffmpeg

    import src.platform.assets.thumbnails as thumbnails_module

    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    monkeypatch.setattr(imageio_ffmpeg, "get_ffmpeg_exe", lambda: "ffmpeg")
    monkeypatch.setattr(
        thumbnails_module.subprocess,
        "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            args=["ffmpeg"],
            returncode=-9,
            stdout="",
            stderr="terminated",
        ),
    )

    with pytest.raises(PreviewRendererTemporarilyUnavailableError):
        _render_video_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )


def test_video_preview_classifies_output_parent_io_as_renderer_unavailable(
    tmp_path,
) -> None:
    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    blocked_parent = tmp_path / "blocked"
    blocked_parent.write_bytes(b"not-a-directory")

    with pytest.raises(PreviewRendererTemporarilyUnavailableError):
        _render_video_preview_source_sync(
            in_path=source,
            out_path=blocked_parent / "preview.png",
        )


def test_video_preview_classifies_missing_ffmpeg_as_renderer_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    import imageio_ffmpeg

    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")

    def _missing_ffmpeg() -> str:
        raise RuntimeError("No ffmpeg exe could be found")

    monkeypatch.setattr(imageio_ffmpeg, "get_ffmpeg_exe", _missing_ffmpeg)

    with pytest.raises(PreviewRendererTemporarilyUnavailableError) as exc_info:
        _render_video_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )

    assert isinstance(exc_info.value.__cause__, RuntimeError)


def test_video_preview_classifies_ffmpeg_timeout_as_renderer_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    import imageio_ffmpeg

    import src.platform.assets.thumbnails as thumbnails_module

    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    monkeypatch.setattr(imageio_ffmpeg, "get_ffmpeg_exe", lambda: "ffmpeg")

    def _timeout(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(cmd=["ffmpeg"], timeout=30)

    monkeypatch.setattr(thumbnails_module.subprocess, "run", _timeout)

    with pytest.raises(PreviewRendererTemporarilyUnavailableError) as exc_info:
        _render_video_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )

    assert isinstance(exc_info.value.__cause__, subprocess.TimeoutExpired)


def test_video_preview_classifies_ffmpeg_exec_failure_as_renderer_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    import imageio_ffmpeg

    import src.platform.assets.thumbnails as thumbnails_module

    source = tmp_path / "source.mp4"
    source.write_bytes(b"video")
    monkeypatch.setattr(imageio_ffmpeg, "get_ffmpeg_exe", lambda: "/missing/ffmpeg")

    def _missing_binary(*_args: object, **_kwargs: object) -> subprocess.CompletedProcess[str]:
        raise FileNotFoundError("configured ffmpeg binary does not exist")

    monkeypatch.setattr(thumbnails_module.subprocess, "run", _missing_binary)

    with pytest.raises(PreviewRendererTemporarilyUnavailableError) as exc_info:
        _render_video_preview_source_sync(
            in_path=source,
            out_path=tmp_path / "preview.png",
        )

    assert isinstance(exc_info.value.__cause__, FileNotFoundError)
