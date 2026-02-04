from __future__ import annotations

from apps.api.modules.analytics.ingest import sanitize_properties


def test_sanitize_properties_drops_sensitive_keys() -> None:
    raw = {
        "password": "p@ssw0rd",
        "token": "abc",
        "Authorization": "Bearer xxx",
        "safe": "ok",
        "nested": {"secret": "nope", "ok": 1},
    }
    out = sanitize_properties(raw, max_keys=50, max_string_length=512, max_depth=5)
    assert isinstance(out, dict)
    assert "password" not in out
    assert "token" not in out
    assert "Authorization" not in out
    assert out.get("safe") == "ok"
    nested = out.get("nested")
    assert isinstance(nested, dict)
    assert "secret" not in nested
    assert nested.get("ok") == 1


def test_sanitize_properties_truncates_long_strings() -> None:
    raw = {"msg": "x" * 100}
    out = sanitize_properties(raw, max_keys=50, max_string_length=16, max_depth=5)
    assert isinstance(out, dict)
    assert isinstance(out.get("msg"), str)
    assert len(out["msg"]) <= 16
    assert out["msg"].endswith("...")


def test_sanitize_properties_limits_depth() -> None:
    raw = {"a": {"b": {"c": {"d": 1}}}}
    out = sanitize_properties(raw, max_keys=50, max_string_length=512, max_depth=2)
    assert isinstance(out, dict)
    assert isinstance(out.get("a"), dict)
    # Depth is limited; deep subtree should be collapsed to None.
    assert out["a"].get("b") is None


def test_sanitize_properties_limits_keys() -> None:
    raw = {f"k{i}": i for i in range(100)}
    out = sanitize_properties(raw, max_keys=10, max_string_length=512, max_depth=5)
    assert isinstance(out, dict)
    assert len([k for k in out.keys() if not k.startswith("__")]) <= 10
    assert out.get("__truncated__") is True
