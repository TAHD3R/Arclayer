from __future__ import annotations

import argparse
import asyncio
import getpass
import hashlib
import os
from pathlib import Path
from uuid import UUID

from src.common.utils.public_ids import decode_public_id, is_public_id
from src.config import get_settings
from src.core.database.orm import close_orm, init_orm
from src.llm.keys import encrypt_virtual_key
from src.llm.runtime import _resolve_key_path
from src.models.ai.ai_api_key import AIAPIKey, KeyOwnerType, KeyType

VIRTUAL_KEY_ENV = "ARCLAYER_LITELLM_VIRTUAL_KEY"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Register a LiteLLM virtual key for Arclayer AI inference.",
    )
    parser.add_argument(
        "--owner-type",
        choices=[KeyOwnerType.WORKSPACE.value, KeyOwnerType.USER.value, KeyOwnerType.PLATFORM.value],
        default=KeyOwnerType.WORKSPACE.value,
        help="Key owner scope used by Arclayer's key resolver.",
    )
    parser.add_argument(
        "--owner-id",
        help="Workspace/user id. Accepts Arclayer public ids or raw UUIDs. Omit for --owner-type platform.",
    )
    parser.add_argument(
        "--provider",
        choices=["openai", "anthropic", "deepseek"],
        default="openai",
        help="Provider name inferred from the chat model by Arclayer.",
    )
    parser.add_argument(
        "--litellm-key-id",
        help="Optional LiteLLM key id returned by /key/generate.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Deactivate existing active keys for the same owner/provider before creating the new key.",
    )
    return parser.parse_args()


def _parse_owner_id(raw: str | None, owner_type: KeyOwnerType) -> UUID:
    if owner_type == KeyOwnerType.PLATFORM:
        return UUID(int=0)
    if raw is None or not raw.strip():
        raise SystemExit("--owner-id is required for workspace and user keys")

    value = raw.strip()
    if is_public_id(value):
        return decode_public_id(value)
    try:
        return UUID(value)
    except ValueError as exc:
        raise SystemExit("--owner-id must be an Arclayer public id or raw UUID") from exc


def _read_virtual_key() -> str:
    value = os.environ.get(VIRTUAL_KEY_ENV)
    if value and value.strip():
        return value.strip()

    prompted = getpass.getpass(f"LiteLLM virtual key ({VIRTUAL_KEY_ENV}): ").strip()
    if not prompted:
        raise SystemExit("LiteLLM virtual key is required")
    return prompted


def _hash_key(virtual_key: str) -> str:
    return hashlib.sha256(virtual_key.encode("utf-8")).hexdigest()


async def _register_key() -> None:
    args = _parse_args()
    owner_type = KeyOwnerType(args.owner_type)
    owner_id = _parse_owner_id(args.owner_id, owner_type)
    virtual_key = _read_virtual_key()

    settings = get_settings()
    if settings.ai.master_key_path is None:
        raise SystemExit("AI__MASTER_KEY_PATH must be configured before storing virtual keys")

    await init_orm(settings)
    try:
        query = AIAPIKey.filter(
            owner_type=owner_type,
            owner_id=owner_id,
            key_type=KeyType.VIRTUAL_KEY,
            provider=args.provider,
            is_active=True,
        )
        existing = await query.count()
        if existing and not args.replace:
            raise SystemExit(
                "An active key already exists for this owner/provider. "
                "Re-run with --replace to deactivate it and create a new key."
            )
        if existing and args.replace:
            await query.update(is_active=False)

        master_key_path = _resolve_key_path(settings.ai.master_key_path)
        encrypted = encrypt_virtual_key(virtual_key, master_key_path)
        record = await AIAPIKey.create(
            owner_type=owner_type,
            owner_id=owner_id,
            key_type=KeyType.VIRTUAL_KEY,
            provider=args.provider,
            litellm_key_id=args.litellm_key_id,
            key_hash=_hash_key(virtual_key),
            virtual_key_enc=encrypted,
            metadata_json={
                "owner_type": owner_type.value,
                "owner_id": str(owner_id),
                "provider": args.provider,
                "source": "scripts.register_ai_litellm_key",
            },
        )
    finally:
        await close_orm()

    print(f"Registered {args.provider} LiteLLM virtual key for {owner_type.value}: {record.id}")
    print(f"Encryption key file: {Path(settings.ai.master_key_path)}")


def main() -> None:
    asyncio.run(_register_key())


if __name__ == "__main__":
    main()
