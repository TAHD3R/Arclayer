from __future__ import annotations

import subprocess

from imageio_ffmpeg import get_ffmpeg_exe

from src.platform.assets.thumbnails import (
    _render_pdf_preview_source_sync,
    _render_video_preview_source_sync,
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
