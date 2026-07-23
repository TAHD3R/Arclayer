from __future__ import annotations

from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

from src.common.email.provider import SendResult
from src.core.exceptions import BadRequest, Conflict, ServiceUnavailable
from src.core.http.pagination import PageParams
from src.modules.system.mail.schema import (
    MailTemplateCreateRequest,
    MailTemplatePatchRequest,
    MailTemplatePreviewRequest,
    MailTemplateTestSendRequest,
)
from src.modules.system.mail.template_contracts import EmailTemplateRepositoryProtocol, EmailTemplateSender
from src.modules.system.mail.template_defaults import DEFAULT_EMAIL_TEMPLATES
from src.modules.system.mail.template_service import EmailTemplateService


class FakeTemplateRepository(EmailTemplateRepositoryProtocol):
    def __init__(self, records: list[Any] | None = None) -> None:
        self.records = records or []
        self.revisions: list[Any] = []
        self.actors: dict[UUID, Any] = {}
        self.audit_events: list[Any] = []
        self.deleted_ids: list[object] = []
        self.template_reference_count = 0
        self.fail_revision = False

    @asynccontextmanager
    async def transaction(self):
        snapshot = deepcopy((self.records, self.revisions, self.audit_events, self.deleted_ids))
        try:
            yield None
        except BaseException:
            self.records, self.revisions, self.audit_events, self.deleted_ids = snapshot
            raise

    async def list_records(self) -> list[Any]:
        return list(self.records)

    async def get(
        self,
        template_id: Any,
        *,
        conn: Any = None,
        for_update: bool = False,
    ) -> Any | None:
        del conn, for_update
        return next((record for record in self.records if record.id == template_id), None)

    async def create(self, *, data: dict[str, Any], conn: Any = None) -> Any:
        del conn
        now = datetime.now(UTC)
        record = SimpleNamespace(
            id=uuid4(),
            created_at=now,
            updated_at=now,
            version=1,
            **data,
        )
        self.records.append(record)
        return record

    async def update_fields(
        self,
        instance: Any,
        *,
        fields: dict[str, Any],
        conn: Any = None,
    ) -> Any:
        del conn
        for key, value in fields.items():
            setattr(instance, key, value)
        instance.updated_at = datetime.now(UTC)
        return instance

    async def delete(self, *, id: Any, conn: Any = None) -> Any:
        del conn
        self.deleted_ids.append(id)
        self.records = [record for record in self.records if record.id != id]
        return True

    async def count_active_references(self, *, key: str, locale: str) -> int:
        del key, locale
        return self.template_reference_count

    async def create_revision(self, *, data: dict[str, Any], conn: Any = None) -> Any:
        del conn
        if self.fail_revision:
            raise RuntimeError("revision write failed")
        revision = SimpleNamespace(id=uuid4(), created_at=datetime.now(UTC), **data)
        self.revisions.append(revision)
        return revision

    async def list_revisions(
        self,
        *,
        key: str,
        locale: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[Any], int]:
        rows = [
            revision
            for revision in self.revisions
            if revision.key == key and (locale is None or revision.locale == locale)
        ]
        rows.sort(key=lambda revision: (revision.created_at, revision.version), reverse=True)
        return rows[offset : offset + limit], len(rows)

    async def get_revision(self, revision_id: UUID) -> Any | None:
        return next(
            (revision for revision in self.revisions if revision.id == revision_id),
            None,
        )

    async def list_revision_actors(self, user_ids: set[UUID]) -> dict[UUID, Any]:
        return {user_id: self.actors[user_id] for user_id in user_ids if user_id in self.actors}


class FakeTemplateSender:
    def __init__(self, result: SendResult | None = None) -> None:
        self.result = result or SendResult(
            success=True,
            provider_id="smtp",
            message_id="message-1",
            attempts=1,
            latency_ms=12.5,
        )
        self.calls: list[dict[str, Any]] = []

    async def send_template_version(self, **kwargs: Any) -> SendResult:
        self.calls.append(kwargs)
        return self.result


class FailingTemplateSender:
    async def send_template_version(self, **kwargs: Any) -> SendResult:
        del kwargs
        raise ConnectionError("provider unavailable")


def _service(
    repository: FakeTemplateRepository,
    *,
    email_sender: EmailTemplateSender | None = None,
) -> EmailTemplateService:
    async def write_activity(*, settings: Any, payload: Any, conn: Any = None) -> Any:
        del settings, conn
        event = SimpleNamespace(id=uuid4(), payload=payload)
        repository.audit_events.append(event)
        return event

    return EmailTemplateService(
        repository,
        activity_writer=write_activity,
        email_sender=email_sender,
    )


def _record(
    *,
    key: str,
    locale: str,
    name: str,
    subject: str,
    html: str,
    text: str,
    variables: list[str],
    enabled: bool = True,
    version: int = 1,
):
    now = datetime(2026, 7, 23, 8, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=uuid4(),
        key=key,
        locale=locale,
        name=name,
        description=None,
        subject_template=subject,
        html_template=html,
        text_template=text,
        variables=variables,
        is_enabled=enabled,
        version=version,
        created_at=now,
        updated_at=now,
    )


def _default_record(key: str, locale: str, *, version: int = 1):
    template = next(item for item in DEFAULT_EMAIL_TEMPLATES if item.key == key and item.locale == locale)
    return _record(
        key=template.key,
        locale=template.locale,
        name=template.name,
        subject=template.subject,
        html=template.html,
        text=template.text,
        variables=list(template.variables),
        version=version,
    )


def test_email_template_preview_renders_all_parts_and_escapes_html_variables() -> None:
    service = _service(FakeTemplateRepository())

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
    service = _service(FakeTemplateRepository())

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
    service = _service(FakeTemplateRepository())

    with pytest.raises(BadRequest) as exc:
        service.preview(
            MailTemplatePreviewRequest(
                subject_template="Subject",
                html_template=html_template,
                text_template="Text",
            )
        )

    assert exc.value.error == "MAIL_TEMPLATE_HTML_UNSAFE"


@pytest.mark.asyncio
async def test_email_template_list_groups_locales_and_applies_server_filters() -> None:
    records = [
        _default_record("workspace_invitation", "zh-CN"),
        _default_record("workspace_invitation", "en-US", version=2),
        _record(
            key="release_digest",
            locale="en-US",
            name="Release digest",
            subject="Your weekly release digest",
            html="<p>Digest</p>",
            text="Digest",
            variables=[],
        ),
    ]
    service = _service(FakeTemplateRepository(records))

    page = await service.list_templates(
        params=PageParams(page=1, size=20),
        display_locale="zh-CN",
        q="workspace",
        ordering="-version",
        owner="builtin",
        locale="en-US",
    )

    assert page.total == 1
    assert page.items[0].key == "workspace_invitation"
    assert page.items[0].name == "工作空间邀请"
    assert [item.locale for item in page.items[0].locales] == ["en-US", "zh-CN"]
    assert page.items[0].latest_version == 2
    assert {item.source_state for item in page.items[0].locales} == {"default"}


@pytest.mark.asyncio
async def test_email_template_list_reports_partial_and_overridden_state() -> None:
    zh = _default_record("notification", "zh-CN")
    en = _default_record("notification", "en-US")
    en.subject_template = "Custom subject"
    en.is_enabled = False
    service = _service(FakeTemplateRepository([zh, en]))

    page = await service.list_templates(
        params=PageParams(page=1, size=20),
        display_locale="en-US",
        source_state="overridden",
    )

    assert page.total == 1
    assert page.items[0].health == "partial"
    states = {item.locale: item.source_state for item in page.items[0].locales}
    assert states == {"en-US": "overridden", "zh-CN": "default"}


@pytest.mark.asyncio
async def test_email_template_builtin_delete_is_rejected_and_custom_delete_succeeds() -> None:
    builtin = _default_record("welcome", "zh-CN")
    custom = _record(
        key="release_digest",
        locale="zh-CN",
        name="发布摘要",
        subject="发布摘要",
        html="<p>发布摘要</p>",
        text="发布摘要",
        variables=[],
    )
    repository = FakeTemplateRepository([builtin, custom])
    service = _service(repository)

    with pytest.raises(Conflict) as exc:
        await service.delete_template(builtin.id, expected_version=builtin.version)
    assert exc.value.error == "MAIL_TEMPLATE_BUILTIN_DELETE_FORBIDDEN"

    await service.delete_template(custom.id, expected_version=custom.version)
    assert repository.deleted_ids == [custom.id]
    assert repository.revisions[-1].action == "deleted"
    assert repository.revisions[-1].version == 2


@pytest.mark.asyncio
async def test_email_template_delete_rejects_active_campaign_references() -> None:
    custom = _record(
        key="release_digest",
        locale="en-US",
        name="Release digest",
        subject="Release digest",
        html="<p>Release digest</p>",
        text="Release digest",
        variables=[],
    )
    repository = FakeTemplateRepository([custom])
    repository.template_reference_count = 2
    service = _service(repository)

    with pytest.raises(Conflict) as exc:
        await service.delete_template(custom.id, expected_version=custom.version)

    assert exc.value.error == "MAIL_TEMPLATE_IN_USE"
    assert exc.value.meta == {"referenceCount": 2}
    assert repository.deleted_ids == []
    assert repository.revisions == []


@pytest.mark.asyncio
async def test_email_template_restore_default_replaces_content_and_increments_version() -> None:
    record = _default_record("welcome", "en-US", version=4)
    record.name = "Changed"
    record.subject_template = "Changed subject"
    record.is_enabled = False
    repository = FakeTemplateRepository([record])
    service = _service(repository)

    restored = await service.restore_default(record.id, expected_version=record.version)
    default = next(item for item in DEFAULT_EMAIL_TEMPLATES if item.key == "welcome" and item.locale == "en-US")

    assert restored.name == default.name
    assert restored.subject_template == default.subject
    assert restored.is_enabled is True
    assert restored.version == 5
    assert repository.revisions[-1].action == "restored"
    assert repository.audit_events[-1].payload.event_name == "system.mail.template.restored"


@pytest.mark.asyncio
async def test_email_template_create_writes_initial_revision_and_audit() -> None:
    repository = FakeTemplateRepository()
    service = _service(repository)

    created = await service.create_template(
        MailTemplateCreateRequest(
            key="release_digest",
            locale="en-US",
            name="Release digest",
            subject_template="Release digest",
            html_template="<p>Release digest</p>",
            text_template="Release digest",
        )
    )

    assert created.version == 1
    assert len(repository.revisions) == 1
    assert repository.revisions[0].action == "created"
    assert repository.revisions[0].template_id == created.id
    assert repository.audit_events[0].payload.event_name == "system.mail.template.created"


@pytest.mark.asyncio
async def test_email_template_update_requires_current_version() -> None:
    record = _default_record("welcome", "en-US", version=3)
    repository = FakeTemplateRepository([record])
    service = _service(repository)

    updated = await service.update_template(
        record.id,
        MailTemplatePatchRequest(expected_version=3, subject_template="Updated subject"),
    )

    assert updated.version == 4
    assert updated.subject_template == "Updated subject"
    assert repository.revisions[-1].changed_fields == ["subject_template"]

    with pytest.raises(Conflict) as exc:
        await service.update_template(
            record.id,
            MailTemplatePatchRequest(expected_version=3, subject_template="Stale overwrite"),
        )
    assert exc.value.error == "MAIL_TEMPLATE_REVISION_CONFLICT"
    assert record.subject_template == "Updated subject"
    assert len(repository.revisions) == 1


@pytest.mark.asyncio
async def test_email_template_update_records_only_fields_with_value_changes() -> None:
    record = _default_record("welcome", "en-US", version=3)
    repository = FakeTemplateRepository([record])
    service = _service(repository)

    await service.update_template(
        record.id,
        MailTemplatePatchRequest(
            expected_version=3,
            name=record.name,
            description=record.description,
            subject_template=record.subject_template,
            html_template=record.html_template,
            text_template=record.text_template,
            variables=record.variables,
            is_enabled=False,
        ),
    )

    assert repository.revisions[-1].changed_fields == ["is_enabled"]


@pytest.mark.asyncio
async def test_runtime_required_template_cannot_be_disabled_without_a_fallback() -> None:
    record = _default_record("reset_password", "en-US")
    repository = FakeTemplateRepository([record])
    service = _service(repository)

    with pytest.raises(Conflict) as exc:
        await service.update_template(
            record.id,
            MailTemplatePatchRequest(expected_version=1, is_enabled=False),
        )

    assert exc.value.error == "MAIL_TEMPLATE_REQUIRED_DISABLE_FORBIDDEN"
    assert record.is_enabled is True
    assert repository.revisions == []


@pytest.mark.asyncio
async def test_template_test_send_uses_current_version_and_audits_provider_acceptance() -> None:
    record = _default_record("welcome", "en-US", version=4)
    repository = FakeTemplateRepository([record])
    sender = FakeTemplateSender()
    service = _service(repository, email_sender=sender)

    result = await service.send_test(
        record.id,
        MailTemplateTestSendRequest(
            recipient="admin@example.com",
            variables={"username": "Admin"},
        ),
    )

    assert result.state == "accepted"
    assert result.provider == "smtp"
    assert result.message_id == "message-1"
    assert sender.calls[0]["template_key"] == "welcome"
    assert sender.calls[0]["template_version"] == 4
    assert sender.calls[0]["locale"] == "en-US"
    assert sender.calls[0]["variables"] == {"username": "Admin"}
    assert sender.calls[0]["idempotency_key"].startswith("mail-template-test:")
    assert repository.audit_events[-1].payload.event_name == "system.mail.template.test_sent"
    assert "recipient" not in repository.audit_events[-1].payload.properties


@pytest.mark.asyncio
async def test_template_test_send_never_reports_provider_rejection_as_success() -> None:
    record = _default_record("welcome", "en-US")
    sender = FakeTemplateSender(
        SendResult(
            success=False,
            provider_id="smtp",
            error="rejected",
            attempts=1,
        )
    )
    repository = FakeTemplateRepository([record])
    service = _service(repository, email_sender=sender)

    with pytest.raises(ServiceUnavailable) as exc:
        await service.send_test(
            record.id,
            MailTemplateTestSendRequest(
                recipient="admin@example.com",
                variables={"username": "Admin"},
            ),
        )

    assert getattr(exc.value, "error", None) == "MAIL_TEMPLATE_TEST_SEND_FAILED"
    assert repository.audit_events == []


@pytest.mark.asyncio
async def test_template_test_send_exposes_provider_connection_failure_as_service_unavailable() -> None:
    record = _default_record("welcome", "en-US")
    repository = FakeTemplateRepository([record])
    service = _service(repository, email_sender=FailingTemplateSender())

    with pytest.raises(ServiceUnavailable) as exc:
        await service.send_test(
            record.id,
            MailTemplateTestSendRequest(
                recipient="admin@example.com",
                variables={"username": "Admin"},
            ),
        )

    assert exc.value.error == "MAIL_TEMPLATE_TEST_SEND_FAILED"
    assert repository.audit_events == []


@pytest.mark.asyncio
async def test_email_template_delete_and_restore_reject_stale_versions() -> None:
    custom = _record(
        key="release_digest",
        locale="en-US",
        name="Release digest",
        subject="Release digest",
        html="<p>Release digest</p>",
        text="Release digest",
        variables=[],
        version=4,
    )
    builtin = _default_record("welcome", "en-US", version=5)
    repository = FakeTemplateRepository([custom, builtin])
    service = _service(repository)

    with pytest.raises(Conflict) as delete_exc:
        await service.delete_template(custom.id, expected_version=3)
    assert delete_exc.value.error == "MAIL_TEMPLATE_REVISION_CONFLICT"

    with pytest.raises(Conflict) as restore_exc:
        await service.restore_default(builtin.id, expected_version=4)
    assert restore_exc.value.error == "MAIL_TEMPLATE_REVISION_CONFLICT"
    assert repository.revisions == []
    assert repository.audit_events == []


@pytest.mark.asyncio
async def test_email_template_mutation_rolls_back_when_revision_write_fails() -> None:
    record = _default_record("welcome", "en-US", version=2)
    original_subject = record.subject_template
    repository = FakeTemplateRepository([record])
    repository.fail_revision = True
    service = _service(repository)

    with pytest.raises(RuntimeError, match="revision write failed"):
        await service.update_template(
            record.id,
            MailTemplatePatchRequest(expected_version=2, subject_template="Not committed"),
        )

    persisted = repository.records[0]
    assert persisted.version == 2
    assert persisted.subject_template == original_subject
    assert repository.revisions == []
    assert repository.audit_events == []


@pytest.mark.asyncio
async def test_email_template_history_filters_locales_and_projects_actor_identity() -> None:
    repository = FakeTemplateRepository()
    service = _service(repository)
    actor_id = uuid4()
    repository.actors[actor_id] = SimpleNamespace(
        id=actor_id,
        username="admin",
        display_name="System admin",
        avatar_url="https://example.test/avatar.png",
    )
    template_id = uuid4()
    now = datetime.now(UTC)
    for locale, version in (("en-US", 1), ("zh-CN", 2), ("en-US", 3)):
        repository.revisions.append(
            SimpleNamespace(
                id=uuid4(),
                template_id=template_id,
                key="welcome",
                locale=locale,
                version=version,
                action="updated",
                name="Welcome",
                description=None,
                subject_template="Welcome",
                html_template="<p>Welcome</p>",
                text_template="Welcome",
                variables=[],
                is_enabled=True,
                changed_fields=["subject_template"],
                actor_user_id=actor_id,
                created_at=now,
            )
        )

    page = await service.list_history(
        key="welcome",
        locale="en-US",
        params=PageParams(page=1, size=1),
    )
    detail = await service.get_revision(repository.revisions[0].id)

    assert page.total == 2
    assert page.pages == 2
    assert page.next == 2
    assert page.items[0].locale == "en-US"
    assert page.items[0].actor is not None
    assert page.items[0].actor.display_name == "System admin"
    assert detail.subject_template == "Welcome"
    assert detail.actor is not None
    assert detail.actor.avatar_url == "https://example.test/avatar.png"
