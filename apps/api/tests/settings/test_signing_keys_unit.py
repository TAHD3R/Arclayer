from __future__ import annotations

from pathlib import Path

from apps.api.settings.signing import (
    ensure_signing_keypair,
    load_private_key,
    load_public_key,
    sign_detached,
    verify_detached,
)


def test_signing_keypair_roundtrip(tmp_path: Path) -> None:
    priv_path = tmp_path / "signing.ed25519"
    pub_path = tmp_path / "signing.ed25519.pub"

    priv, pub, fp1 = ensure_signing_keypair(private_path=priv_path, public_path=pub_path)
    assert fp1
    assert priv_path.exists()
    assert pub_path.exists()

    message = b"demo payload"
    sig = sign_detached(message, private_key=priv)
    assert verify_detached(message, signature_b64=sig, public_key=pub) is True

    priv2, pub2, fp2 = ensure_signing_keypair(private_path=priv_path, public_path=pub_path)
    assert fp1 == fp2

    # Ensure on-disk format is loadable.
    priv_loaded = load_private_key(priv_path)
    pub_loaded = load_public_key(pub_path)
    assert verify_detached(message, signature_b64=sig, public_key=pub_loaded) is True
    # Sanity: key objects are of expected type and usable.
    _ = priv_loaded.sign(b"hello")
    pub_loaded.verify(_, b"hello")


def test_verify_rejects_wrong_signature(tmp_path: Path) -> None:
    priv_path = tmp_path / "signing.ed25519"
    pub_path = tmp_path / "signing.ed25519.pub"
    priv, pub, _fp = ensure_signing_keypair(private_path=priv_path, public_path=pub_path)

    sig = sign_detached(b"a", private_key=priv)
    assert verify_detached(b"b", signature_b64=sig, public_key=pub) is False
