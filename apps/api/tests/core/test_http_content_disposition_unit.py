from __future__ import annotations

from apps.api.core.http.content_disposition import build_attachment_content_disposition


def test_build_attachment_content_disposition_includes_utf8_and_ascii_fallback() -> None:
    v = build_attachment_content_disposition("中文 文件名.pdf")
    assert v.startswith("attachment; ")
    assert "filename=" in v
    assert "filename*=" in v
    assert "UTF-8" in v


def test_build_attachment_content_disposition_strips_newlines() -> None:
    v = build_attachment_content_disposition("a\r\nb.txt")
    assert "\r" not in v
    assert "\n" not in v
