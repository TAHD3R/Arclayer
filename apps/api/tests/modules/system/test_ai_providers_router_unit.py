from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import ANY, AsyncMock, patch
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest, Conflict, init_exception_handlers
from src.llm.errors import LLMErrorCode
from src.llm.runtime import LLMRuntimeError
from src.modules.ai.provider_icon import AIProviderIcon
from src.modules.platform_ai.schema import PlatformAIProviderOut
from src.modules.platform_identity.http import get_current_platform_session
from src.modules.system.ai_providers.configuration import (
    ConfiguredSystemModel,
    configured_models_from_records,
    resolve_active_system_model,
)
from src.modules.system.ai_providers.router import get_system_ai_provider_service
from src.modules.system.ai_providers.router import router as ai_providers_router
from src.modules.system.ai_providers.schema import (
    SystemAIProviderBillingConfig,
    SystemAIProviderModelMapping,
    SystemAIProviderOut,
    SystemAIProviderTestConfig,
    SystemAIProviderUpdateRequest,
)
from src.modules.system.ai_providers.service import SystemAIProviderService
from tests.utils.asgi_client import asgi_client


async def test_system_ai_providers_route_returns_empty_list() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(ai_providers_router, prefix="/platform-api/v1/ai")

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    class EmptyProviderService:
        async def list_providers(self):
            return []

    app.dependency_overrides[get_current_platform_session] = _platform_owner
    app.dependency_overrides[get_system_ai_provider_service] = lambda: EmptyProviderService()

    async with asgi_client(app) as client:
        res = await client.get("/platform-api/v1/ai/providers")

    assert res.status_code == 200
    assert res.json()["data"] == {"providers": []}


def test_system_and_readiness_provider_ids_share_the_public_id_contract() -> None:
    provider_id = uuid4()
    now = datetime.now(UTC)
    system_provider = SystemAIProviderOut(
        id=provider_id,
        provider="deepseek",
        label="DeepSeek",
        compatibility="deepseek",
        auth_header="Authorization",
        is_active=True,
        is_archived=False,
        cleanup_required=False,
        has_virtual_key=True,
        default_model="deepseek-v4-pro",
        test_config=SystemAIProviderTestConfig(),
        billing_config=SystemAIProviderBillingConfig(),
        created_at=now,
        updated_at=now,
    )
    readiness_provider = PlatformAIProviderOut(
        id=provider_id,
        provider="deepseek",
        label="DeepSeek",
        default_model="deepseek-v4-pro",
        desired_is_active=True,
        archived=False,
        cleanup_required=False,
        configured=True,
        reachable=None,
        permitted=True,
        routable=False,
        health="unknown",
        health_failure_code=None,
        freshness_at=None,
        expires_at=None,
        last_used_at=None,
        actions=(),
    )

    expected = encode_uuid(provider_id)
    assert system_provider.model_dump(mode="json")["id"] == expected
    assert readiness_provider.model_dump(mode="json")["id"] == expected


async def test_system_ai_provider_service_provisions_litellm_model_and_key() -> None:
    settings = Settings()
    settings.ai = settings.ai.model_copy(
        update={
            "litellm_base_url": "http://litellm.internal:4000",
            "litellm_master_key": "master-key",
            "litellm_timeout_seconds": 9.0,
        },
    )
    service = SystemAIProviderService(settings)
    litellm_client = SimpleNamespace(
        register_model=AsyncMock(return_value={"model_info": {"id": "model-123"}}),
        generate_key=AsyncMock(return_value={"key": "sk-virtual", "key_id": "key-123"}),
        list_model_info=AsyncMock(),
    )
    provider_id = uuid4()

    with patch("src.modules.system.ai_providers.service.LiteLLMClient", return_value=litellm_client) as client_cls:
        provisioned = await service._provision_litellm_access(
            provider_id=provider_id,
            provider="deepseek",
            label="DeepSeek",
            compatibility="deepseek",
            auth_header="Authorization",
            provider_api_key="provider-secret",
            base_url="https://api.deepseek.com",
            model_mappings=[
                SystemAIProviderModelMapping(
                    public_model="deepseek-v4-pro",
                    provider_model="deepseek-chat",
                )
            ],
        )

    client_cls.assert_called_once_with(base_url="http://litellm.internal:4000", timeout_seconds=9.0)
    litellm_client.register_model.assert_awaited_once_with(
        master_key="master-key",
        model_name="deepseek-v4-pro",
        provider_model="deepseek/deepseek-chat",
        provider_api_key="provider-secret",
        api_base="https://api.deepseek.com",
        extra_headers=None,
        metadata={
            "provider": "deepseek",
            "label": "DeepSeek",
            "compatibility": "deepseek",
            "arclayer_provider_id": str(provider_id),
            "arclayer_generation_id": ANY,
            "source": "system.ai_providers",
        },
    )
    litellm_client.generate_key.assert_awaited_once_with(
        master_key="master-key",
        models=["deepseek-v4-pro"],
        metadata={
            "provider": "deepseek",
            "label": "DeepSeek",
            "compatibility": "deepseek",
            "arclayer_provider_id": str(provider_id),
            "arclayer_generation_id": ANY,
            "source": "system.ai_providers",
        },
    )
    assert provisioned.virtual_key == "sk-virtual"
    assert provisioned.litellm_key_id == "key-123"
    assert provisioned.registered_model_ids == {"deepseek-v4-pro": "model-123"}


async def test_system_ai_provider_service_requires_litellm_master_key() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())

    with pytest.raises(BadRequest) as exc_info:
        await service._provision_litellm_access(
            provider_id=uuid4(),
            provider="deepseek",
            label="DeepSeek",
            compatibility="openai_compatible",
            auth_header="Authorization",
            provider_api_key="provider-secret",
            base_url=None,
            model_mappings=[
                SystemAIProviderModelMapping(
                    public_model="deepseek/deepseek-chat",
                    provider_model="deepseek-chat",
                )
            ],
        )

    assert exc_info.value.error == "AI_PROVIDER_LITELLM_MASTER_KEY_REQUIRED"


async def test_system_ai_provider_legacy_connection_change_requires_one_time_api_key() -> None:
    service = SystemAIProviderService(Settings())
    provider_record = SimpleNamespace(
        id=uuid4(),
        provider="deepseek",
        is_active=False,
        metadata_json={
            "source": "system.ai_providers",
            "label": "DeepSeek",
            "request_model": "deepseek-chat",
            "base_url": "https://api.deepseek.com",
        },
    )

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider_record)),
        patch.object(service, "_assert_public_model_aliases_available", new=AsyncMock()),
        pytest.raises(BadRequest) as exc_info,
    ):
        await service.update_provider(
            uuid4(),
            SystemAIProviderUpdateRequest(
                model_mappings=[
                    SystemAIProviderModelMapping(
                        public_model="deepseek/deepseek-reasoner",
                        provider_model="deepseek-reasoner",
                    )
                ],
                default_model="deepseek/deepseek-reasoner",
            ),
            actor_user_id=uuid4(),
        )

    assert exc_info.value.error == "AI_PROVIDER_STORED_API_KEY_UNAVAILABLE"
    assert "provider-secret" not in exc_info.value.message


async def test_system_ai_provider_connection_change_reuses_stored_upstream_api_key() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())
    provider_id = uuid4()
    provider_record = SimpleNamespace(id=provider_id, is_active=False, save=AsyncMock())
    current = SimpleNamespace(is_archived=False, model_mappings=[])
    updated = SimpleNamespace(is_archived=False, model_mappings=[])
    replace = AsyncMock(return_value=False)

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider_record)),
        patch.object(service, "_configuration", return_value=current),
        patch.object(service, "_updated_configuration", return_value=updated),
        patch.object(service, "_connection_changed", return_value=True),
        patch.object(service, "_stored_provider_api_key", return_value="stored-provider-key"),
        patch.object(service, "_replace_litellm_access", new=replace),
        patch.object(service, "_to_out", return_value="updated-provider"),
    ):
        result = await service.update_provider(
            provider_id,
            SystemAIProviderUpdateRequest(provider="openai"),
            actor_user_id=uuid4(),
        )

    assert result == "updated-provider"
    replace.assert_awaited_once_with(
        record=provider_record,
        configuration=updated,
        provider_api_key="stored-provider-key",
    )


def test_system_ai_provider_stored_key_maps_missing_key_file_to_business_error() -> None:
    settings = Settings()
    settings.ai = settings.ai.model_copy(update={"master_key_path": "/tmp/missing-fernet-key"})
    service = SystemAIProviderService(settings)
    provider_record = SimpleNamespace(provider_api_key_enc="encrypted-provider-key")

    with (
        patch(
            "src.modules.system.ai_providers.service.decrypt_virtual_key",
            side_effect=LLMRuntimeError(
                code=LLMErrorCode.SYSTEM_INTERNAL_ERROR,
                message="missing key file",
                status_code=500,
            ),
        ),
        pytest.raises(BadRequest) as exc_info,
    ):
        service._stored_provider_api_key(cast(Any, provider_record))

    assert exc_info.value.error == "AI_PROVIDER_STORED_API_KEY_UNAVAILABLE"
    assert "missing key file" not in exc_info.value.message


async def test_system_ai_provider_rotation_cleans_new_litellm_resources_when_persistence_fails() -> None:
    service = SystemAIProviderService(Settings())
    provider_record = SimpleNamespace(
        id=uuid4(),
        provider="deepseek",
        virtual_key_enc="encrypted-old-virtual-key",
        litellm_key_id="old-key-id",
        metadata_json={"registered_model_ids": {"old-model": "old-model-id"}},
        save=AsyncMock(),
    )
    configuration = SimpleNamespace(
        provider="openai",
        label="OpenAI",
        compatibility="openai",
        auth_header="Authorization",
        base_url="https://api.openai.com/v1",
        model_mappings=[
            SystemAIProviderModelMapping(
                public_model="gpt-5.6",
                provider_model="gpt-5.6",
            )
        ],
    )
    provisioned = SimpleNamespace(
        virtual_key="new-virtual-key",
        litellm_key_id="new-key-id",
        registered_model_ids={"gpt-5.6": "new-model-id"},
        generation_id="new-generation",
    )
    cleanup = AsyncMock()

    with (
        patch.object(service, "_retry_pending_cleanup", new=AsyncMock(return_value=True)),
        patch.object(service, "_decrypt_virtual_key", return_value="old-virtual-key"),
        patch.object(service, "_provision_litellm_access", new=AsyncMock(return_value=provisioned)),
        patch.object(
            service,
            "_encrypt_virtual_key",
            side_effect=BadRequest(error="AI_PROVIDER_MASTER_KEY_REQUIRED"),
        ),
        patch.object(service, "_cleanup_litellm_access", new=cleanup),
        pytest.raises(BadRequest) as exc_info,
    ):
        await service._replace_litellm_access(
            record=cast(Any, provider_record),
            configuration=cast(Any, configuration),
            provider_api_key="provider-secret",
        )

    assert exc_info.value.error == "AI_PROVIDER_MASTER_KEY_REQUIRED"
    cleanup.assert_awaited_once_with(
        virtual_key="new-virtual-key",
        registered_model_ids={"gpt-5.6": "new-model-id"},
    )
    provider_record.save.assert_not_awaited()


async def test_system_ai_provider_rejects_public_model_alias_owned_by_another_service() -> None:
    class _ProviderQuery:
        async def values(self, *_fields: str):
            return [
                {
                    "provider": "deepseek",
                    "metadata_json": {
                        "source": "system.ai_providers",
                        "model_mappings": [
                            {
                                "public_model": "shared-model",
                                "provider_model": "deepseek-chat",
                            }
                        ],
                    },
                }
            ]

    service = SystemAIProviderService(Settings())
    with (
        patch.object(service, "_base_query", return_value=_ProviderQuery()),
        pytest.raises(Conflict) as exc_info,
    ):
        await service._assert_public_model_aliases_available([
            SystemAIProviderModelMapping(
                public_model="shared-model",
                provider_model="gpt-5.6",
            )
        ])

    assert exc_info.value.error == "AI_PROVIDER_PUBLIC_MODEL_CONFLICT"
    assert exc_info.value.meta == {"public_models": ["shared-model"]}


async def test_system_ai_provider_noop_connection_update_normalizes_provider() -> None:
    now = datetime.now(UTC)
    activity_writer = AsyncMock()
    service = SystemAIProviderService(Settings(), activity_writer=activity_writer)
    provider_id = uuid4()
    mapping = SystemAIProviderModelMapping(
        public_model="deepseek-v4-pro",
        provider_model="deepseek-chat",
    )
    provider_record = SimpleNamespace(
        id=provider_id,
        provider=" deepseek ",
        is_active=False,
        virtual_key_enc="encrypted-virtual-key",
        litellm_key_id="key-123",
        metadata_json={
            "source": "system.ai_providers",
            "label": "DeepSeek",
            "compatibility": "deepseek",
            "auth_header": "Authorization",
            "base_url": "https://api.deepseek.com/v1",
            "model_mappings": [mapping.model_dump(mode="json")],
            "default_model": "deepseek-v4-pro",
        },
        created_at=now,
        updated_at=now,
        last_used_at=None,
        expires_at=None,
        save=AsyncMock(),
    )

    with patch.object(service, "_get_provider", new=AsyncMock(return_value=provider_record)):
        result = await service.update_provider(
            provider_id,
            SystemAIProviderUpdateRequest(
                provider="deepseek",
                label="DeepSeek",
                compatibility="deepseek",
                auth_header="Authorization",
                base_url="https://api.deepseek.com/v1",
                model_mappings=[mapping],
                default_model="deepseek-v4-pro",
            ),
            actor_user_id=uuid4(),
        )

    assert result.provider == "deepseek"
    assert provider_record.provider == "deepseek"
    provider_record.save.assert_awaited_once_with()
    activity_writer.assert_awaited_once()


async def test_resolve_active_system_model_rejects_duplicate_public_model() -> None:
    public_model = "shared-model"
    configured = [
        ConfiguredSystemModel(
            provider_id=uuid4(),
            provider="deepseek",
            public_model=public_model,
            provider_model="deepseek-chat",
            label="Shared DeepSeek model",
            description=None,
            label_i18n={},
            description_i18n={},
            is_default=True,
            billing=None,
            provider_icon=None,
        ),
        ConfiguredSystemModel(
            provider_id=uuid4(),
            provider="openai",
            public_model=public_model,
            provider_model="gpt-5.6",
            label="Shared OpenAI model",
            description=None,
            label_i18n={},
            description_i18n={},
            is_default=False,
            billing=None,
            provider_icon=None,
        ),
    ]

    with (
        patch(
            "src.modules.system.ai_providers.configuration.list_active_system_models",
            new=AsyncMock(return_value=configured),
        ),
        pytest.raises(LLMRuntimeError) as exc_info,
    ):
        await resolve_active_system_model(public_model)

    assert exc_info.value.code == LLMErrorCode.PROVIDER_MODEL_CONFIGURATION_CONFLICT
    assert exc_info.value.status_code == 409


async def test_system_ai_provider_archive_preserves_legacy_metadata() -> None:
    now = datetime.now(UTC)
    activity_writer = AsyncMock()
    service = SystemAIProviderService(Settings(), activity_writer=activity_writer)
    provider_id = uuid4()
    provider_record = SimpleNamespace(
        id=provider_id,
        provider="deepseek",
        is_active=False,
        virtual_key_enc="encrypted-virtual-key",
        litellm_key_id="key-123",
        metadata_json={
            "source": "system.ai_providers",
            "request_model": "legacy-model",
            "readiness": {"status": "healthy", "checked_at": now.isoformat()},
        },
        created_at=now,
        updated_at=now,
        last_used_at=None,
        expires_at=None,
        save=AsyncMock(),
    )

    with patch.object(service, "_get_provider", new=AsyncMock(return_value=provider_record)):
        result = await service.update_provider(
            provider_id,
            SystemAIProviderUpdateRequest(is_archived=True),
            actor_user_id=uuid4(),
        )

    assert result.is_archived is True
    assert provider_record.metadata_json["request_model"] == "legacy-model"
    assert provider_record.metadata_json["readiness"]["status"] == "healthy"
    assert isinstance(provider_record.metadata_json["archived_at"], str)
    assert "model_mappings" not in provider_record.metadata_json
    assert "default_model" not in provider_record.metadata_json
    provider_record.save.assert_awaited_once_with()
    activity_writer.assert_awaited_once()


async def test_system_ai_provider_readiness_failure_does_not_disclose_virtual_key() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())
    provider = SimpleNamespace(
        id=uuid4(),
        provider="deepseek",
        virtual_key_enc="encrypted-secret",
        metadata_json={"request_model": "deepseek-v4-pro"},
        save=AsyncMock(),
    )
    litellm_client = SimpleNamespace(chat=AsyncMock(side_effect=httpx.ConnectError("provider-secret")))

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider)),
        patch.object(service, "_decrypt_virtual_key", return_value="sk-virtual-secret"),
        patch("src.modules.system.ai_providers.service.LiteLLMClient", return_value=litellm_client),
    ):
        result = await service.test_readiness(provider_id=provider.id, actor_user_id=uuid4())

    assert result.status == "unhealthy"
    assert result.failure_code == "AI_PROVIDER_READINESS_TEST_FAILED"
    assert "secret" not in result.model_dump_json()
    assert provider.metadata_json["readiness"]["failure_code"] == "AI_PROVIDER_READINESS_TEST_FAILED"


async def test_system_ai_provider_readiness_disables_deepseek_reasoning() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())
    provider = SimpleNamespace(
        id=uuid4(),
        provider="deepseek",
        virtual_key_enc="encrypted-secret",
        metadata_json={
            "source": "system.ai_providers",
            "compatibility": "openai_compatible",
            "model_mappings": [
                {
                    "public_model": "deepseek-v4-pro",
                    "provider_model": "deepseek-chat",
                }
            ],
            "default_model": "deepseek-v4-pro",
            "test_config": {
                "prompt": "Respond with OK.",
                "expected_text": "OK",
                "max_tokens": 8,
            },
        },
        save=AsyncMock(),
    )
    litellm_client = SimpleNamespace(
        chat=AsyncMock(
            return_value={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": "OK", "role": "assistant"},
                    }
                ]
            }
        )
    )

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider)),
        patch.object(service, "_decrypt_virtual_key", return_value="sk-virtual-secret"),
        patch("src.modules.system.ai_providers.service.LiteLLMClient", return_value=litellm_client),
    ):
        result = await service.test_readiness(provider_id=provider.id, actor_user_id=uuid4())

    assert result.status == "healthy"
    assert result.failure_code is None
    litellm_client.chat.assert_awaited_once_with(
        [{"role": "user", "content": "Respond with OK."}],
        model="deepseek-v4-pro",
        temperature=0,
        max_tokens=8,
        virtual_key="sk-virtual-secret",
        thinking={"type": "disabled"},
    )
    assert provider.metadata_json["readiness"]["status"] == "healthy"


async def test_system_ai_provider_readiness_keeps_response_mismatch_distinct_from_transport_failure() -> None:
    service = SystemAIProviderService(Settings(), activity_writer=AsyncMock())
    provider = SimpleNamespace(
        id=uuid4(),
        provider="deepseek",
        virtual_key_enc="encrypted-secret",
        metadata_json={
            "source": "system.ai_providers",
            "compatibility": "deepseek",
            "model_mappings": [
                {
                    "public_model": "deepseek-v4-pro",
                    "provider_model": "deepseek-chat",
                }
            ],
            "default_model": "deepseek-v4-pro",
            "test_config": {
                "prompt": "Respond with OK.",
                "expected_text": "OK",
                "max_tokens": 8,
            },
        },
        save=AsyncMock(),
    )
    litellm_client = SimpleNamespace(
        chat=AsyncMock(
            return_value={
                "choices": [
                    {
                        "finish_reason": "length",
                        "message": {
                            "content": None,
                            "reasoning_content": "The response budget was consumed by reasoning.",
                            "role": "assistant",
                        },
                    }
                ]
            }
        )
    )

    with (
        patch.object(service, "_get_provider", new=AsyncMock(return_value=provider)),
        patch.object(service, "_decrypt_virtual_key", return_value="sk-virtual-secret"),
        patch("src.modules.system.ai_providers.service.LiteLLMClient", return_value=litellm_client),
    ):
        result = await service.test_readiness(provider_id=provider.id, actor_user_id=uuid4())

    assert result.status == "unhealthy"
    assert result.failure_code == "AI_PROVIDER_READINESS_RESPONSE_MISMATCH"
    assert provider.metadata_json["readiness"]["failure_code"] == "AI_PROVIDER_READINESS_RESPONSE_MISMATCH"


async def test_cleanup_deletes_only_explicit_registered_deployments() -> None:
    settings = Settings()
    settings.ai = settings.ai.model_copy(update={"litellm_master_key": "master-key"})
    service = SystemAIProviderService(settings)
    client = SimpleNamespace(
        delete_key=AsyncMock(return_value={}),
        delete_model=AsyncMock(return_value={}),
    )

    await service._cleanup_litellm_access(
        virtual_key="old-key",
        registered_model_ids={"old-public": "old-model-id"},
        client=cast(Any, client),
    )

    client.delete_key.assert_awaited_once_with(master_key="master-key", key="old-key")
    client.delete_model.assert_awaited_once_with(
        master_key="master-key",
        model_id="old-model-id",
    )
    assert not hasattr(client, "list_model_info")


def test_configured_models_require_explicit_model_mappings() -> None:
    records = [
        {
            "id": uuid4(),
            "provider": "openai",
            "metadata_json": {
                "source": "system.ai_providers",
                "request_model": "legacy-model",
            },
        },
        {
            "id": uuid4(),
            "provider": "anthropic",
            "metadata_json": {"source": "system.ai_providers"},
        },
    ]

    assert configured_models_from_records(records) == []


def test_model_mapping_normalizes_identifiers_at_the_api_boundary() -> None:
    mapping = SystemAIProviderModelMapping(
        public_model="  public-model  ",
        provider_model="  upstream-model  ",
    )

    assert mapping.public_model == "public-model"
    assert mapping.provider_model == "upstream-model"


def test_configured_models_expose_theme_aware_provider_icon() -> None:
    provider_id = uuid4()
    models = configured_models_from_records([
        {
            "id": provider_id,
            "provider": "deepseek",
            "metadata_json": {
                "source": "system.ai_providers",
                "model_mappings": [
                    {
                        "public_model": "deepseek-v4-pro",
                        "provider_model": "deepseek-chat",
                    }
                ],
                "default_model": "deepseek-v4-pro",
                "icon": {
                    "light_url": "/provider-icons/deepseek-light.svg",
                    "dark_url": "/provider-icons/deepseek-dark.svg",
                },
            },
        }
    ])

    assert models[0].provider_icon == AIProviderIcon(
        light_url="/provider-icons/deepseek-light.svg",
        dark_url="/provider-icons/deepseek-dark.svg",
    )
