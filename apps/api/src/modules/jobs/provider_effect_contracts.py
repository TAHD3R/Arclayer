from __future__ import annotations

from collections.abc import Iterable, Mapping
from types import MappingProxyType
from typing import Protocol, cast

from orjson import dumps
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from src.common.types.json_types import JsonObject
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.provider_effect_schema import validate_json_object


class ProviderEffectContract(Protocol):
    effect_type: str
    schema_version: int

    def validate_manifest(self, value: JsonObject) -> JsonObject: ...

    def validate_settlement_reference(
        self,
        *,
        disposition: ProviderEffectDisposition,
        value: JsonObject,
    ) -> JsonObject: ...


class PydanticProviderEffectContract(BaseModel):
    """Strict versioned domain adapter without a jobs-core dependency on the domain."""

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid", frozen=True)

    effect_type: str
    schema_version: int = Field(..., strict=True, ge=1)
    manifest_model: type[BaseModel]
    settlement_models: Mapping[ProviderEffectDisposition, type[BaseModel]]

    @field_validator("effect_type")
    @classmethod
    def normalize_effect_type(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized or len(normalized) > 128:
            raise ValueError("provider effect contract type must be a non-empty stable identity")
        return normalized

    @model_validator(mode="after")
    def validate_contract_models(self) -> PydanticProviderEffectContract:
        terminal_dispositions = {
            ProviderEffectDisposition.COMMITTED,
            ProviderEffectDisposition.CLEANED,
        }
        if set(self.settlement_models) != terminal_dispositions:
            raise ValueError("provider effect contracts require committed and cleaned settlement schemas")
        for model in (self.manifest_model, *self.settlement_models.values()):
            if model.model_config.get("extra") != "forbid":
                raise ValueError("provider effect contract schemas must set extra='forbid'")

        object.__setattr__(self, "settlement_models", MappingProxyType(dict(self.settlement_models)))
        return self

    def validate_manifest(self, value: JsonObject) -> JsonObject:
        return self._validate_model(self.manifest_model, value)

    def validate_settlement_reference(
        self,
        *,
        disposition: ProviderEffectDisposition,
        value: JsonObject,
    ) -> JsonObject:
        if disposition == ProviderEffectDisposition.ACTIVE:
            raise ValueError("active provider effects cannot have settlement references")
        return self._validate_model(self.settlement_models[disposition], value)

    @staticmethod
    def _validate_model(model: type[BaseModel], value: JsonObject) -> JsonObject:
        validated = model.model_validate_json(dumps(value), strict=True)
        return cast(JsonObject, validated.model_dump(mode="json", by_alias=False))


class ProviderEffectContractRegistry:
    """Exact fail-closed registry keyed by effect type and schema version."""

    def __init__(self, contracts: Iterable[ProviderEffectContract] = ()) -> None:
        registrations: dict[tuple[str, int], ProviderEffectContract] = {}
        for contract in contracts:
            key = (contract.effect_type, contract.schema_version)
            if key in registrations:
                raise ValueError(f"duplicate provider effect contract: {key[0]} v{key[1]}")
            registrations[key] = contract
        self._contracts = MappingProxyType(registrations)

    def require(self, *, effect_type: str, schema_version: int) -> ProviderEffectContract:
        contract = self._contracts.get((effect_type, schema_version))
        if contract is None:
            raise JobExecutionStateInvariantError(f"Unknown provider effect contract: {effect_type} v{schema_version}")
        return contract

    def validate_manifest(
        self,
        *,
        effect_type: str,
        schema_version: int,
        value: JsonObject,
    ) -> JsonObject:
        contract = self.require(effect_type=effect_type, schema_version=schema_version)
        try:
            canonical = contract.validate_manifest(value)
        except (ValidationError, ValueError, TypeError) as exc:
            raise JobExecutionStateInvariantError(
                f"Provider effect manifest does not match {effect_type} v{schema_version}"
            ) from exc
        return validate_json_object(canonical, label="provider effect contract manifest")

    def validate_settlement_reference(
        self,
        *,
        effect_type: str,
        schema_version: int,
        disposition: ProviderEffectDisposition,
        value: JsonObject,
    ) -> JsonObject:
        contract = self.require(effect_type=effect_type, schema_version=schema_version)
        try:
            canonical = contract.validate_settlement_reference(
                disposition=disposition,
                value=value,
            )
        except (ValidationError, ValueError, TypeError, KeyError) as exc:
            raise JobExecutionStateInvariantError(
                f"Provider effect settlement does not match {effect_type} v{schema_version}"
            ) from exc
        return validate_json_object(canonical, label="provider effect contract settlement reference")
