from __future__ import annotations

import pytest

from src.core.exceptions import BadRequest
from src.modules.system.mail.schema import MailTemplatePreviewRequest
from src.modules.system.mail.template_service import EmailTemplateService


def test_email_template_preview_renders_all_parts_and_escapes_html_variables() -> None:
    service = EmailTemplateService()

    preview = service.preview(
        MailTemplatePreviewRequest(
            subject_template="Welcome, {{ name }}",
            html_template="<p>Welcome, {{ name }}</p>",
            text_template="Welcome, {{ name }}",
            variables={"name": "<Admin>"},
        )
    )

    assert preview.subject == "Welcome, <Admin>"
    assert preview.html == "<p>Welcome, &lt;Admin&gt;</p>"
    assert preview.text == "Welcome, <Admin>"


def test_email_template_preview_rejects_missing_variables() -> None:
    service = EmailTemplateService()

    with pytest.raises(BadRequest) as exc:
        service.preview(
            MailTemplatePreviewRequest(
                subject_template="{{ missing }}",
                html_template="<p>{{ missing }}</p>",
                text_template="{{ missing }}",
            )
        )

    assert exc.value.error == "MAIL_TEMPLATE_RENDER_FAILED"


@pytest.mark.parametrize(
    "html_template",
    [
        "<script>alert(1)</script>",
        '<a href="javascript:alert(1)">Open</a>',
        '<img src="https://example.com/pixel" onerror="alert(1)">',
    ],
)
def test_email_template_preview_rejects_unsafe_html(html_template: str) -> None:
    service = EmailTemplateService()

    with pytest.raises(BadRequest) as exc:
        service.preview(
            MailTemplatePreviewRequest(
                subject_template="Subject",
                html_template=html_template,
                text_template="Text",
            )
        )

    assert exc.value.error == "MAIL_TEMPLATE_HTML_UNSAFE"
