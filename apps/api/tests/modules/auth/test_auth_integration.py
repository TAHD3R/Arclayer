from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.exceptions import Unauthorized
from src.core.extensions.dependencies import get_connector_registry
from src.core.registries import ConnectorRegistry
from src.core.routes import include_auth_router_with_prefix
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization
from src.models.organization.user import User, UserCredential, UserStatus
from src.modules.analytics.system.router import router as system_activity_router
from src.modules.auth import service as auth_service_module
from src.modules.auth.service import AuthService
from src.modules.auth.sessions import service as auth_session_service_module
from src.modules.auth.sessions.service import AuthSessionService
from src.modules.auth.tokens.service import decode_token, hash_password, verify_password
from src.modules.platform_identity.http import get_current_platform_session

pytestmark = pytest.mark.integration


def _access_token(tokens: dict) -> str:
    token = tokens.get("accessToken") or tokens.get("access_token")
    assert isinstance(token, str) and token
    return token


async def _login(client: AsyncClient, *, email: str, password: str) -> dict:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    payload = res.json().get("data") or {}
    assert isinstance(payload, dict)
    return payload


async def test_auth_login_refresh_integration(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()

    user = None
    try:
        password = "pass1234"
        user = await User.create(
            username=f"demo_{uuid.uuid4().hex}",
            email=None,
            status=UserStatus.ACTIVE,
            display_name="Demo",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password(password, settings.auth))

        service = AuthService(settings, valkey=client)
        tokens = await service.login(identifier=user.username, password=password)
        assert tokens.access_token
        assert tokens.refresh_token
        event = await AuditEvent.filter(event_name="auth.login", actor_user_id=user.id).first()
        assert event is not None
        assert event.subject_user_id == user.id
        assert event.entity_type == "auth_session"
        assert event.properties is not None
        assert event.properties.get("auth_method") == "password"
        assert event.properties.get("password") is None

        rotated = await service.refresh(refresh_token=tokens.refresh_token)
        assert rotated.refresh_token != tokens.refresh_token

        with pytest.raises(Unauthorized):
            await service.refresh(refresh_token=tokens.refresh_token)

        await user.refresh_from_db()
        assert user.token_version == 1
    finally:
        if user is not None:
            await AuditEvent.filter(actor_user_id=user.id).delete()
            await AuditEvent.filter(subject_user_id=user.id).delete()
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()


async def test_auth_login_activity_rollback_removes_refresh_session(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()
    user = None
    try:
        password = "pass1234"
        user = await User.create(
            username=f"login_rollback_{uuid.uuid4().hex}",
            email=None,
            status=UserStatus.ACTIVE,
            display_name="Login Rollback",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password(password, settings.auth))

        service = AuthService(settings, valkey=client)
        event_count_before = await AuditEvent.filter(event_name="auth.login").count()
        original_write_required_activity_event = auth_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.login":
                raise RuntimeError("forced activity write failure: auth.login")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await service.login(identifier=user.username, password=password)
        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="auth.login").count() == event_count_before
        assert service.refresh_store is not None
        assert await service.refresh_store.list_active(user.id) == []
        await user.refresh_from_db()
        assert user.last_login_at is None
    finally:
        if user is not None:
            await AuditEvent.filter(actor_user_id=user.id).delete()
            await AuditEvent.filter(subject_user_id=user.id).delete()
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()


async def test_auth_session_revoke_activity_readback_and_rollback(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()
    user = None
    rollback_user = None
    try:
        password = "pass1234"
        user = await User.create(
            username=f"session_{uuid.uuid4().hex}",
            email=None,
            status=UserStatus.ACTIVE,
            display_name="Session User",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password(password, settings.auth))

        auth = AuthService(settings, valkey=client)
        sessions = AuthSessionService(settings, valkey=client)
        tokens = await auth.login(identifier=user.username, password=password)
        session_id = decode_token(tokens.access_token, settings.auth).get("sid")
        assert isinstance(session_id, str)

        event_count_before = await AuditEvent.filter(event_name="auth.session.revoked").count()
        logout_tokens = await auth.login(identifier=user.username, password=password)
        logout_session_id = decode_token(logout_tokens.access_token, settings.auth).get("sid")
        assert isinstance(logout_session_id, str)
        await auth.logout(user_id=user.id, refresh_token=logout_tokens.refresh_token)
        logout_event = (
            await AuditEvent
            .filter(
                event_name="auth.session.revoked",
                actor_user_id=user.id,
                subject_user_id=user.id,
            )
            .order_by("-occurred_at")
            .first()
        )
        assert logout_event is not None
        assert logout_event.entity_type == "auth_session"
        assert logout_event.properties is not None
        assert logout_event.properties.get("scope") == "current"
        assert logout_event.properties.get("session_id") == logout_session_id
        assert logout_event.properties.get("refresh_token") is None
        assert await AuditEvent.filter(event_name="auth.session.revoked").count() == event_count_before + 1

        await sessions.revoke_session(user_id=user.id, session_id=session_id)
        event = (
            await AuditEvent
            .filter(
                event_name="auth.session.revoked",
                actor_user_id=user.id,
                subject_user_id=user.id,
            )
            .order_by("-occurred_at")
            .first()
        )
        assert event is not None
        assert event.subject_user_id == user.id
        assert event.entity_type == "auth_session"
        assert event.properties is not None
        assert event.properties.get("scope") == "current"
        assert event.properties.get("session_id") == session_id
        assert event.properties.get("refresh_token") is None
        assert await AuditEvent.filter(event_name="auth.session.revoked").count() == event_count_before + 2
        assert auth.refresh_store is not None
        assert await auth.refresh_store.list_active(user.id) == []

        failed_tokens = await auth.login(identifier=user.username, password=password)
        failed_session_id = decode_token(failed_tokens.access_token, settings.auth).get("sid")
        assert isinstance(failed_session_id, str)
        active_before = await auth.refresh_store.list_active(user.id)
        original_write_required_activity_event = auth_session_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.session.revoked":
                raise RuntimeError("forced activity write failure: auth.session.revoked")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.sessions.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await sessions.revoke_session(user_id=user.id, session_id=failed_session_id)
        monkeypatch.setattr(
            "src.modules.auth.sessions.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="auth.session.revoked").count() == event_count_before + 2
        assert await auth.refresh_store.list_active(user.id) == active_before

        all_tokens = await auth.login(identifier=user.username, password=password)
        all_tokens_2 = await auth.login(identifier=user.username, password=password)
        active_before_all = await auth.refresh_store.list_active(user.id)
        revoked_count = len(active_before_all)
        assert revoked_count == 3
        event_count_before_all = await AuditEvent.filter(event_name="auth.session.revoked").count()

        await auth.logout_all(user_id=user.id)
        all_event = (
            await AuditEvent
            .filter(
                event_name="auth.session.revoked",
                actor_user_id=user.id,
                subject_user_id=user.id,
            )
            .order_by("-occurred_at")
            .first()
        )
        assert all_event is not None
        assert all_event.entity_type == "auth_session"
        assert all_event.properties is not None
        assert all_event.properties.get("scope") == "all"
        assert all_event.properties.get("revoked_count") == revoked_count
        assert all_event.properties.get("refresh_token") is None
        assert await AuditEvent.filter(event_name="auth.session.revoked").count() == event_count_before_all + 1
        await user.refresh_from_db()
        assert user.token_version == 1
        assert await auth.refresh_store.list_active(user.id) == []
        assert all_tokens.refresh_token
        assert all_tokens_2.refresh_token

        rollback_user = await User.create(
            username=f"session_rollback_{uuid.uuid4().hex}",
            email=None,
            status=UserStatus.ACTIVE,
            display_name="Session Rollback User",
            avatar_url=None,
        )
        await UserCredential.create(user=rollback_user, password_hash=hash_password(password, settings.auth))
        rollback_tokens = await auth.login(identifier=rollback_user.username, password=password)
        rollback_tokens_2 = await auth.login(identifier=rollback_user.username, password=password)
        rollback_active_before = await auth.refresh_store.list_active(rollback_user.id)
        assert len(rollback_active_before) == 2
        rollback_event_count_before = await AuditEvent.filter(event_name="auth.session.revoked").count()
        original_auth_write_required_activity_event = auth_service_module.write_required_activity_event

        async def _failing_auth_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.session.revoked":
                raise RuntimeError("forced activity write failure: auth.session.revoked")
            return await original_auth_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            _failing_auth_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await auth.logout_all(user_id=rollback_user.id)
        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            original_auth_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="auth.session.revoked").count() == rollback_event_count_before
        await rollback_user.refresh_from_db()
        assert rollback_user.token_version == 0
        assert await auth.refresh_store.list_active(rollback_user.id) == rollback_active_before
        assert rollback_tokens.refresh_token
        assert rollback_tokens_2.refresh_token
    finally:
        if user is not None:
            await AuditEvent.filter(actor_user_id=user.id).delete()
            await AuditEvent.filter(subject_user_id=user.id).delete()
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()
        if rollback_user is not None:
            await AuditEvent.filter(actor_user_id=rollback_user.id).delete()
            await AuditEvent.filter(subject_user_id=rollback_user.id).delete()
            await UserCredential.filter(user_id=rollback_user.id).delete()
            await User.filter(id=rollback_user.id).delete()


async def test_auth_account_deletion_activity_readback_and_rollback(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()
    password = "pass1234"
    user = None
    rollback_user = None
    org = None
    rollback_org = None
    admin = None
    rollback_admin = None
    try:
        admin = await User.create(
            username=f"account_delete_admin_{uuid.uuid4().hex}",
            email=f"account-delete-admin-{uuid.uuid4().hex[:8]}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Account Delete Admin",
            avatar_url=None,
        )
        user = await User.create(
            username=f"account_delete_{uuid.uuid4().hex}",
            email=f"account-delete-{uuid.uuid4().hex[:8]}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Delete Me",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password(password, settings.auth))
        org = await Organization.create(
            name="Account Delete Org",
            slug=f"account-delete-org-{uuid.uuid4().hex[:8]}",
            owner_user_id=admin.id,
        )
        await OrgMembership.create(
            organization_id=org.id,
            user_id=user.id,
            role=OrgRole.MEMBER,
            role_code=OrgRole.MEMBER.value,
            status="active",
        )

        app = FastAPI()
        include_auth_router_with_prefix(app, settings=settings)
        connector_registry = ConnectorRegistry()
        app.dependency_overrides[get_connector_registry] = lambda: connector_registry
        app.state.valkey = client
        transport = ASGITransport(app=app, raise_app_exceptions=True)
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            tokens = await _login(http, email=str(user.email), password=password)
            delete_headers = {"Authorization": f"Bearer {_access_token(tokens)}"}
            delete_res = await http.post(
                "/api/v1/auth/me/delete",
                json={"email": user.email, "password": password},
                headers=delete_headers,
            )
            assert delete_res.status_code == 200, delete_res.text

            platform_app = FastAPI()
            platform_app.include_router(system_activity_router, prefix="/platform-api/v1/activity")

            async def _platform_owner_override() -> SimpleNamespace:
                return SimpleNamespace(actor_id=admin.id, is_instance_owner=True)

            platform_app.dependency_overrides[get_current_platform_session] = _platform_owner_override
            async with AsyncClient(
                transport=ASGITransport(app=platform_app), base_url="http://platform.test"
            ) as platform_http:
                activity_res = await platform_http.get(
                    f"/platform-api/v1/activity?eventName=auth.account.deleted&entityType=auth_account"
                    f"&entityId={user.id}&page=1&size=10"
                )
            assert activity_res.status_code == 200, activity_res.text
            activity_items = activity_res.json()["data"]["items"]
            assert len(activity_items) == 1
            event = activity_items[0]
            assert event["eventName"] == "auth.account.deleted"
            assert "organizationId" not in event
            assert event["actorUserId"] == encode_uuid(user.id)
            assert event["subjectUserId"] == encode_uuid(user.id)
            assert event["entityType"] == "auth_account"
            assert event["entityId"] == encode_uuid(user.id)
            assert event["properties"]["change_kind"] == "delete"
            assert "pass1234" not in str(event["properties"])
            assert "account-delete-" not in str(event["properties"])

        deleted = await User.get(id=user.id)
        assert deleted.username.startswith("deleted_")
        assert deleted.email is None
        assert deleted.display_name is None
        assert deleted.status == UserStatus.DISABLED
        assert deleted.token_version == 1
        assert await UserCredential.filter(user_id=user.id).count() == 0
        assert await OrgMembership.filter(user_id=user.id).count() == 0
        account_service = AuthService(settings, valkey=client)
        assert account_service.refresh_store is not None
        assert await account_service.refresh_store.list_active(user.id) == []

        rollback_user = await User.create(
            username=f"account_delete_rollback_{uuid.uuid4().hex}",
            email=f"account-delete-rollback-{uuid.uuid4().hex[:8]}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Rollback Delete",
            avatar_url=None,
        )
        await UserCredential.create(user=rollback_user, password_hash=hash_password(password, settings.auth))
        rollback_admin = await User.create(
            username=f"account_delete_rollback_admin_{uuid.uuid4().hex}",
            email=f"account-delete-rollback-admin-{uuid.uuid4().hex[:8]}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Rollback Account Delete Admin",
            avatar_url=None,
        )
        rollback_org = await Organization.create(
            name="Account Delete Rollback Org",
            slug=f"account-delete-rollback-org-{uuid.uuid4().hex[:8]}",
            owner_user_id=rollback_admin.id,
        )
        await OrgMembership.create(
            organization_id=rollback_org.id,
            user_id=rollback_user.id,
            role=OrgRole.MEMBER,
            role_code=OrgRole.MEMBER.value,
            status="active",
        )
        service = AuthService(settings, valkey=client)
        rollback_tokens = await service.login(identifier=str(rollback_user.email), password=password)
        assert service.refresh_store is not None
        active_before = await service.refresh_store.list_active(rollback_user.id)
        original_write_required_activity_event = auth_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.account.deleted":
                raise RuntimeError("forced activity write failure: auth.account.deleted")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await service.delete_my_account(
                user=rollback_user,
                email=str(rollback_user.email),
                password=password,
                code=None,
                backup_code=None,
            )
        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert (
            await AuditEvent.filter(
                event_name="auth.account.deleted",
                actor_user_id=rollback_user.id,
            ).count()
            == 0
        )
        assert await service.refresh_store.list_active(rollback_user.id) == active_before
        await rollback_user.refresh_from_db()
        assert rollback_user.email is not None
        assert rollback_user.display_name == "Rollback Delete"
        assert rollback_user.status == UserStatus.ACTIVE
        assert rollback_user.token_version == 0
        assert await UserCredential.filter(user_id=rollback_user.id).count() == 1
        assert await OrgMembership.filter(user_id=rollback_user.id).count() == 1
        assert rollback_tokens.refresh_token
    finally:
        _ = rollback_org


async def test_auth_password_reset_activity_readback_and_rollback(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()
    user = None
    try:
        user = await User.create(
            username=f"reset_{uuid.uuid4().hex}",
            email=f"reset_{uuid.uuid4().hex}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Reset User",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password("oldpass1", settings.auth))

        service = AuthService(settings, valkey=client)

        async def _skip_security_alert(**kwargs: object) -> None:
            _ = kwargs

        monkeypatch.setattr(service, "send_security_alert", _skip_security_alert)

        issued = await service.forgot_password(email=str(user.email))
        assert issued is not None
        token, _, _, user_id = issued

        await service.reset_password(reset_token=token, new_password="newpass1")
        event = await AuditEvent.filter(
            event_name="auth.password.reset.completed",
            actor_user_id=user_id,
            subject_user_id=user_id,
        ).first()
        assert event is not None
        await user.refresh_from_db()
        credential = await UserCredential.get(user_id=user.id)
        assert user.token_version == 1
        assert verify_password("newpass1", credential.password_hash, settings.auth) is True

        issued = await service.forgot_password(email=str(user.email))
        assert issued is not None
        failed_token, _, _, _ = issued
        credential_before = await UserCredential.get(user_id=user.id)
        password_hash_before = credential_before.password_hash
        await user.refresh_from_db()
        token_version_before = user.token_version
        event_count_before = await AuditEvent.filter(event_name="auth.password.reset.completed").count()

        original_write_required_activity_event = auth_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.password.reset.completed":
                raise RuntimeError("forced activity write failure: auth.password.reset.completed")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await service.reset_password(reset_token=failed_token, new_password="rollback1")
        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="auth.password.reset.completed").count() == event_count_before
        await user.refresh_from_db()
        credential_after = await UserCredential.get(user_id=user.id)
        assert user.token_version == token_version_before
        assert credential_after.password_hash == password_hash_before
        assert verify_password("newpass1", credential_after.password_hash, settings.auth) is True

        await service.reset_password(reset_token=failed_token, new_password="rollback1")
        assert await AuditEvent.filter(event_name="auth.password.reset.completed").count() == event_count_before + 1
        await user.refresh_from_db()
        credential_final = await UserCredential.get(user_id=user.id)
        assert user.token_version == token_version_before + 1
        assert verify_password("rollback1", credential_final.password_hash, settings.auth) is True
    finally:
        if user is not None:
            await AuditEvent.filter(actor_user_id=user.id).delete()
            await AuditEvent.filter(subject_user_id=user.id).delete()
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()


async def test_auth_password_set_activity_readback_and_rollback(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()
    user = None
    failed_user = None
    try:
        user = await User.create(
            username=f"set_{uuid.uuid4().hex}",
            email=f"set_{uuid.uuid4().hex}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Set Password User",
            avatar_url=None,
        )
        user.last_login_at = datetime.now(UTC)
        await user.save(update_fields=["last_login_at"])

        service = AuthService(settings, valkey=client)
        event_count_before = await AuditEvent.filter(event_name="auth.password.updated").count()

        await service.set_password_for_current_user(
            user_id=user.id,
            new_password="newpass1",
            code=None,
            backup_code=None,
        )
        event = await AuditEvent.filter(
            event_name="auth.password.updated",
            actor_user_id=user.id,
            subject_user_id=user.id,
        ).first()
        assert event is not None
        assert event.entity_type == "auth_credential"
        assert event.properties is not None
        assert event.properties.get("change_kind") == "set"
        assert event.properties.get("new_password") is None
        assert event.properties.get("password") is None
        assert await AuditEvent.filter(event_name="auth.password.updated").count() == event_count_before + 1

        await user.refresh_from_db()
        credential = await UserCredential.get(user_id=user.id)
        assert user.token_version == 1
        assert verify_password("newpass1", credential.password_hash, settings.auth) is True

        event_count_before = await AuditEvent.filter(event_name="auth.password.updated").count()
        await service.change_password(user_id=user.id, old_password="newpass1", new_password="changed1")
        change_event = (
            await AuditEvent
            .filter(
                event_name="auth.password.updated",
                actor_user_id=user.id,
                subject_user_id=user.id,
            )
            .order_by("-created_at")
            .first()
        )
        assert change_event is not None
        assert change_event.entity_type == "auth_credential"
        assert change_event.properties is not None
        assert change_event.properties.get("change_kind") == "change"
        assert change_event.properties.get("old_password") is None
        assert change_event.properties.get("new_password") is None
        assert change_event.properties.get("password") is None
        assert await AuditEvent.filter(event_name="auth.password.updated").count() == event_count_before + 1

        await user.refresh_from_db()
        credential = await UserCredential.get(user_id=user.id)
        assert user.token_version == 2
        assert verify_password("changed1", credential.password_hash, settings.auth) is True

        failed_user = await User.create(
            username=f"set_fail_{uuid.uuid4().hex}",
            email=f"set_fail_{uuid.uuid4().hex}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Set Password Rollback",
            avatar_url=None,
        )
        await UserCredential.create(user=failed_user, password_hash=hash_password("oldpass1", settings.auth))
        failed_event_count_before = await AuditEvent.filter(event_name="auth.password.updated").count()
        original_write_required_activity_event = auth_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.password.updated":
                raise RuntimeError("forced activity write failure: auth.password.updated")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await service.change_password(user_id=failed_user.id, old_password="oldpass1", new_password="rollback1")
        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="auth.password.updated").count() == failed_event_count_before
        await failed_user.refresh_from_db()
        assert failed_user.token_version == 0
        failed_credential = await UserCredential.get(user_id=failed_user.id)
        assert verify_password("oldpass1", failed_credential.password_hash, settings.auth) is True
    finally:
        if user is not None:
            await AuditEvent.filter(actor_user_id=user.id).delete()
            await AuditEvent.filter(subject_user_id=user.id).delete()
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()
        if failed_user is not None:
            await AuditEvent.filter(actor_user_id=failed_user.id).delete()
            await AuditEvent.filter(subject_user_id=failed_user.id).delete()
            await UserCredential.filter(user_id=failed_user.id).delete()
            await User.filter(id=failed_user.id).delete()


async def test_auth_password_remove_activity_readback_and_rollback(
    monkeypatch,
    db_schema,
    valkey_client,
) -> None:
    _ = db_schema
    client, _ = valkey_client
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    get_settings.cache_clear()

    settings = get_settings()
    user = None
    failed_user = None
    try:
        user = await User.create(
            username=f"remove_{uuid.uuid4().hex}",
            email=f"remove_{uuid.uuid4().hex}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Remove Password User",
            avatar_url=None,
        )
        await UserCredential.create(user=user, password_hash=hash_password("oldpass1", settings.auth))

        service = AuthService(settings, valkey=client)

        async def _mail_enabled() -> bool:
            return True

        async def _skip_send_login_code(**kwargs: object) -> None:
            _ = kwargs

        monkeypatch.setattr(service.email_service, "is_enabled", _mail_enabled)
        monkeypatch.setattr(service.email_service, "send_login_code", _skip_send_login_code)

        await service.request_remove_password(user_id=user.id, current_password="oldpass1", locale="en-US")
        store = service._require_password_removal_store()
        record = await store.get(user_id=user.id)
        assert record is not None

        event_count_before = await AuditEvent.filter(event_name="auth.password.updated").count()
        await service.confirm_remove_password(user_id=user.id, code=str(record["code"]))
        event = await AuditEvent.filter(
            event_name="auth.password.updated",
            actor_user_id=user.id,
            subject_user_id=user.id,
        ).first()
        assert event is not None
        assert event.entity_type == "auth_credential"
        assert event.properties is not None
        assert event.properties.get("change_kind") == "remove"
        assert event.properties.get("password") is None
        assert event.properties.get("code") is None
        assert await AuditEvent.filter(event_name="auth.password.updated").count() == event_count_before + 1

        await user.refresh_from_db()
        assert user.token_version == 1
        assert await UserCredential.filter(user_id=user.id).exists() is False

        failed_user = await User.create(
            username=f"remove_fail_{uuid.uuid4().hex}",
            email=f"remove_fail_{uuid.uuid4().hex}@example.com",
            status=UserStatus.ACTIVE,
            display_name="Remove Password Rollback",
            avatar_url=None,
        )
        await UserCredential.create(user=failed_user, password_hash=hash_password("oldpass1", settings.auth))
        await service.request_remove_password(user_id=failed_user.id, current_password="oldpass1", locale="en-US")
        failed_store = service._require_password_removal_store()
        failed_record = await failed_store.get(user_id=failed_user.id)
        assert failed_record is not None
        failed_event_count_before = await AuditEvent.filter(event_name="auth.password.updated").count()
        original_write_required_activity_event = auth_service_module.write_required_activity_event

        async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "auth.password.updated":
                raise RuntimeError("forced activity write failure: auth.password.updated")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            _failing_write_required_activity_event,
        )
        with pytest.raises(RuntimeError, match="forced activity write failure"):
            await service.confirm_remove_password(user_id=failed_user.id, code=str(failed_record["code"]))
        monkeypatch.setattr(
            "src.modules.auth.service.write_required_activity_event",
            original_write_required_activity_event,
        )

        assert await AuditEvent.filter(event_name="auth.password.updated").count() == failed_event_count_before
        await failed_user.refresh_from_db()
        assert failed_user.token_version == 0
        assert await UserCredential.filter(user_id=failed_user.id).exists() is True
        assert await failed_store.get(user_id=failed_user.id) is not None
    finally:
        if user is not None:
            await AuditEvent.filter(actor_user_id=user.id).delete()
            await AuditEvent.filter(subject_user_id=user.id).delete()
            await UserCredential.filter(user_id=user.id).delete()
            await User.filter(id=user.id).delete()
        if failed_user is not None:
            await AuditEvent.filter(actor_user_id=failed_user.id).delete()
            await AuditEvent.filter(subject_user_id=failed_user.id).delete()
            await UserCredential.filter(user_id=failed_user.id).delete()
            await User.filter(id=failed_user.id).delete()
