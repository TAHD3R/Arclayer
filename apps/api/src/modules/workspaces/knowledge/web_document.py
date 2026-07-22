from __future__ import annotations

import hashlib
import re
from html.parser import HTMLParser

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.modules.workspaces.knowledge.source_fetch import FetchedHttpKnowledgeDocument
from src.modules.workspaces.knowledge.source_fetch_errors import (
    KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
    KnowledgeSourceFetchError,
)

_BLOCK_TAGS = frozenset({
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "footer",
    "header",
    "main",
    "nav",
    "p",
    "section",
    "table",
    "tr",
})
_IGNORED_TAGS = frozenset({"canvas", "noscript", "script", "style", "svg", "template"})
_WHITESPACE = re.compile(r"[ \t\f\v]+")


class NormalizedWebKnowledgeDocument(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    content: str = Field(min_length=1)
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    title: str | None = Field(default=None, max_length=256)


def normalize_fetched_web_document(
    fetched: FetchedHttpKnowledgeDocument,
) -> NormalizedWebKnowledgeDocument:
    if fetched.mime_type not in {"text/html", "application/xhtml+xml"}:
        return NormalizedWebKnowledgeDocument(
            content=fetched.content,
            normalized_content_hash=_content_hash(fetched.content),
        )
    parser = _ReadableHtmlParser()
    try:
        parser.feed(fetched.content)
        parser.close()
    except ValueError as exc:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source HTML could not be normalized",
            transient=False,
        ) from exc
    content = parser.render()
    if not content:
        raise KnowledgeSourceFetchError(
            code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
            safe_message="Knowledge source HTML has no readable content",
            transient=False,
        )
    return NormalizedWebKnowledgeDocument(
        content=content,
        normalized_content_hash=_content_hash(content),
        title=parser.title,
    )


class _ReadableHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._ignored_depth = 0
        self._heading_level: int | None = None
        self._title_depth = 0
        self._title_parts: list[str] = []
        self._lines: list[str] = []
        self._current: list[str] = []
        self._list_depth = 0

    @property
    def title(self) -> str | None:
        title = _normalize_inline(" ".join(self._title_parts))
        return title[:256] or None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        tag = tag.lower()
        if tag in _IGNORED_TAGS:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag == "title":
            self._title_depth += 1
        if tag in _BLOCK_TAGS or tag == "br":
            self._flush()
        if tag in {"ul", "ol"}:
            self._list_depth += 1
        if tag == "li":
            self._flush()
            self._current.append("  " * max(0, self._list_depth - 1) + "- ")
        if len(tag) == 2 and tag[0] == "h" and tag[1].isdigit():
            self._flush()
            self._heading_level = int(tag[1])

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _IGNORED_TAGS:
            if self._ignored_depth:
                self._ignored_depth -= 1
            return
        if self._ignored_depth:
            return
        if tag == "title" and self._title_depth:
            self._title_depth -= 1
        if len(tag) == 2 and tag[0] == "h" and tag[1].isdigit():
            self._flush()
            self._heading_level = None
        elif tag in _BLOCK_TAGS or tag == "li":
            self._flush()
        if tag in {"ul", "ol"} and self._list_depth:
            self._list_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        normalized = _normalize_inline(data)
        if not normalized:
            return
        if self._title_depth:
            self._title_parts.append(normalized)
            return
        if self._heading_level is not None and not self._current:
            self._current.append("#" * self._heading_level + " ")
        self._current.append(normalized)

    def render(self) -> str:
        self._flush()
        return "\n\n".join(line for line in self._lines if line).strip()

    def _flush(self) -> None:
        value = _normalize_inline(" ".join(self._current))
        self._current.clear()
        if value and (not self._lines or self._lines[-1] != value):
            self._lines.append(value)


def _normalize_inline(value: str) -> str:
    return _WHITESPACE.sub(" ", value.replace("\r", " ").replace("\n", " ")).strip()


def _content_hash(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"
