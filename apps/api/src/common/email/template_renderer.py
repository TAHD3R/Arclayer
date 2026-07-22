from __future__ import annotations

import re
from dataclasses import dataclass

from jinja2 import StrictUndefined
from jinja2.exceptions import TemplateError
from jinja2.sandbox import SandboxedEnvironment

from src.common.types.json_types import JsonObject

_DANGEROUS_EMAIL_HTML = re.compile(
    r"<\s*(?:script|iframe|object|embed|form|input|button|meta|link)\b"
    r"|\bon[a-z]+\s*="
    r"|\b(?:href|src)\s*=\s*['\"]\s*javascript:",
    re.IGNORECASE,
)


class EmailTemplateSourceError(ValueError):
    pass


class EmailTemplateRenderError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class RenderedEmailTemplate:
    subject: str
    html: str
    text: str


def validate_email_template_source(source: str) -> None:
    try:
        _environment(autoescape=False).parse(source)
    except TemplateError as exc:
        raise EmailTemplateSourceError("MAIL_TEMPLATE_INVALID") from exc


def validate_email_html_template(source: str) -> None:
    validate_email_template_source(source)
    if _DANGEROUS_EMAIL_HTML.search(source):
        raise EmailTemplateSourceError("MAIL_TEMPLATE_HTML_UNSAFE")


def render_email_template(
    *,
    subject_template: str,
    html_template: str,
    text_template: str,
    variables: JsonObject,
) -> RenderedEmailTemplate:
    validate_email_template_source(subject_template)
    validate_email_html_template(html_template)
    validate_email_template_source(text_template)
    try:
        return RenderedEmailTemplate(
            subject=_environment(autoescape=False).from_string(subject_template).render(variables),
            html=_environment(autoescape=True).from_string(html_template).render(variables),
            text=_environment(autoescape=False).from_string(text_template).render(variables),
        )
    except TemplateError as exc:
        raise EmailTemplateRenderError("MAIL_TEMPLATE_RENDER_FAILED") from exc


def _environment(*, autoescape: bool) -> SandboxedEnvironment:
    environment = SandboxedEnvironment(
        autoescape=autoescape,
        undefined=StrictUndefined,
        enable_async=False,
    )
    environment.globals.clear()
    environment.filters.clear()
    return environment
