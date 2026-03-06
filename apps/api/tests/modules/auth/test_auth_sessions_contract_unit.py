from __future__ import annotations

from datetime import UTC, datetime

from apps.api.src.modules.auth.sessions.schema import AuthSessionOut


def test_auth_session_contract_includes_enriched_metadata_fields() -> None:
    assert set(AuthSessionOut.model_fields) >= {
        "session_id",
        "issued_at",
        "last_used_at",
        "current",
        "ip_address",
        "user_agent",
        "device_label",
        "location_label",
        "auth_method",
        "revocable",
    }


def test_auth_session_contract_serializes_enriched_metadata() -> None:
    issued_at = datetime(2026, 3, 6, 12, 0, tzinfo=UTC)
    out = AuthSessionOut(
        session_id="session-1",
        issued_at=issued_at,
        last_used_at=issued_at,
        current=True,
        ip_address="203.0.113.8",
        user_agent="Mozilla/5.0",
        device_label="Chrome on macOS",
        location_label=None,
        auth_method="password+2fa",
        revocable=False,
    )

    payload = out.model_dump(mode="json")

    assert payload["ip_address"] == "203.0.113.8"
    assert payload["user_agent"] == "Mozilla/5.0"
    assert payload["device_label"] == "Chrome on macOS"
    assert payload["location_label"] is None
    assert payload["auth_method"] == "password+2fa"
    assert payload["revocable"] is False
