from __future__ import annotations

from apps.api.src.modules.auth.password.service import hash_password, verify_password


def test_password_hash_and_verify() -> None:
    hashed = hash_password("hello")
    assert verify_password("hello", hashed) is True
    assert verify_password("bad", hashed) is False
