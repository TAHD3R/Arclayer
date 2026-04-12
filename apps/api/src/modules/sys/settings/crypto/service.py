from __future__ import annotations

import binascii
from typing import TYPE_CHECKING

from cryptography.exceptions import InvalidTag

from src.core.exceptions import BadRequest, ServiceUnavailable
from src.modules.sys.settings.schemahelpers.service import _ts
from src.settings.crypto import (
    decrypt_secret,
    encrypt_secret,
    ensure_master_key,
    is_encrypted,
    load_master_key,
    master_key_exists,
)
from src.settings.schema import ConfigSchema
from src.settings.validation import iter_secret_field_paths

if TYPE_CHECKING:
    from src.config import Settings


class SysConfigCryptoMixin:
    settings: Settings

    def _assert_revision_secrets_encrypted(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        value: dict[str, object],
    ) -> None:
        for path in iter_secret_field_paths(schema):
            section_id, field_key = path.split(".", 1)
            section = value.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str) or not raw.strip():
                continue
            if is_encrypted(raw):
                continue
            raise BadRequest(
                message=_ts("BAD_REQUEST", "参数错误"),
                error="SYS_CONFIG_REVISION_PLAINTEXT_SECRET",
                details={"namespace": namespace, "secret_path": path},
            )

    def _decrypt_secret_str_best_effort(self, *, namespace: str, secret_path: str, raw: str) -> str | None:
        if not isinstance(raw, str) or not raw.strip():
            return None
        if not is_encrypted(raw):
            return raw

        key_path = self.settings.security.master_key_path
        if not master_key_exists(key_path):
            return None
        try:
            key = load_master_key(key_path)
            aad = f"{namespace}:{secret_path}"
            return decrypt_secret(raw, key=key, aad=aad)
        except (binascii.Error, OSError, RuntimeError, TypeError, ValueError, UnicodeError, InvalidTag):
            return None

    async def _encrypt_secrets_if_needed(
        self,
        *,
        namespace: str,
        schema: ConfigSchema,
        current: dict[str, object],
        merged: dict[str, object],
    ) -> dict[str, object]:
        secret_paths = list(iter_secret_field_paths(schema))
        needs_encrypt = False
        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = merged.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            cur_section = current.get(section_id)
            if isinstance(cur_section, dict):
                cur_val = cur_section.get(field_key)
                if isinstance(cur_val, str) and raw == cur_val:
                    continue
            needs_encrypt = True
            break

        if not needs_encrypt:
            return merged

        key_path = self.settings.security.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable(
                message=_ts("MASTER_KEY_MISSING", "系统密钥未初始化"),
                error="MASTER_KEY_MISSING",
            )
        key, _fp = ensure_master_key(key_path)

        for path in secret_paths:
            section_id, field_key = path.split(".", 1)
            section = merged.get(section_id)
            if not isinstance(section, dict):
                continue
            raw = section.get(field_key)
            if raw is None:
                continue
            if not isinstance(raw, str):
                continue
            if is_encrypted(raw):
                continue
            aad = f"{namespace}:{path}"
            section[field_key] = encrypt_secret(raw, key=key, aad=aad)

        return merged
