from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from src.common.schemas import BaseSchema
from src.common.utils.public_ids import encode_uuid
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_JOB_TYPE,
    ASSET_THUMBNAIL_JOB_TYPE_VERSION,
    ASSET_THUMBNAIL_JOB_WORKLOAD,
    ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_PROFILE_VERSION,
    ASSET_THUMBNAIL_RETRYABLE_CODES,
    ASSET_THUMBNAIL_TASK_NAME,
    ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS,
    AssetThumbnailExecutionPolicy,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
    AssetThumbnailOutcomeMarker,
    build_asset_thumbnail_job_definition,
    build_asset_thumbnail_source_revision,
    validate_asset_thumbnail_result_semantics,
    validate_asset_thumbnail_target_input,
)
from src.modules.jobs.registry import (
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy


def _target(*, asset_id: UUID | None = None) -> AssetThumbnailJobTarget:
    return AssetThumbnailJobTarget(
        workspace_id=uuid4(),
        project_id=uuid4(),
        entity_id=asset_id or uuid4(),
    )


def _input(*, asset_id: UUID) -> AssetThumbnailJobInput:
    return AssetThumbnailJobInput(
        asset_id=asset_id,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
    )


def test_contracts_dump_stable_camel_case_json_aliases() -> None:
    asset_id = uuid4()
    job_id = uuid4()
    completed_at = datetime(2026, 7, 15, 9, 30, tzinfo=UTC)
    target = _target(asset_id=asset_id)
    input_reference = _input(asset_id=asset_id)
    result = AssetThumbnailJobResult(
        asset_id=asset_id,
        source_revision="a" * 64,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        produced_widths=(320, 640),
        outcome_job_id=job_id,
    )
    marker = AssetThumbnailOutcomeMarker(
        job_id=job_id,
        request_fingerprint="f" * 64,
        output_identity="d" * 64,
        source_revision="a" * 64,
        thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        produced_widths=(320, 640),
        completed_at=completed_at,
    )

    assert target.model_dump(mode="json", by_alias=True) == {
        "workspaceId": encode_uuid(target.workspace_id),
        "projectId": encode_uuid(target.project_id),
        "entityType": "asset",
        "entityId": encode_uuid(asset_id),
    }
    assert input_reference.model_dump(mode="json", by_alias=True) == {
        "assetId": encode_uuid(asset_id),
        "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
    }
    assert result.model_dump(mode="json", by_alias=True) == {
        "kind": "asset_thumbnail_outcome",
        "assetId": encode_uuid(asset_id),
        "sourceRevision": "a" * 64,
        "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
        "producedWidths": [320, 640],
        "outcomeJobId": encode_uuid(job_id),
    }
    assert marker.model_dump(mode="json", by_alias=True) == {
        "jobId": encode_uuid(job_id),
        "requestFingerprint": "f" * 64,
        "outputIdentity": "d" * 64,
        "sourceRevision": "a" * 64,
        "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
        "producedWidths": [320, 640],
        "completedAt": "2026-07-15T09:30:00Z",
    }


def test_contracts_accept_their_json_aliases_and_are_frozen() -> None:
    asset_id = uuid4()
    payload = {
        "workspaceId": encode_uuid(uuid4()),
        "projectId": encode_uuid(uuid4()),
        "entityType": "asset",
        "entityId": encode_uuid(asset_id),
    }

    target = AssetThumbnailJobTarget.model_validate(payload)

    assert target.entity_id == asset_id
    with pytest.raises(ValidationError, match="frozen_instance"):
        target.entity_id = uuid4()


@pytest.mark.parametrize(
    "extra_field",
    ["schemaName", "isolationMode", "queueName", "credentials", "filesystemPath", "profileVersion"],
)
@pytest.mark.parametrize(
    ("contract", "valid_payload"),
    [
        (
            AssetThumbnailJobTarget,
            {
                "workspaceId": encode_uuid(uuid4()),
                "projectId": encode_uuid(uuid4()),
                "entityType": "asset",
                "entityId": encode_uuid(uuid4()),
            },
        ),
        (
            AssetThumbnailJobInput,
            {
                "assetId": encode_uuid(uuid4()),
                "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
            },
        ),
        (
            AssetThumbnailJobResult,
            {
                "kind": "asset_thumbnail_outcome",
                "assetId": encode_uuid(uuid4()),
                "sourceRevision": "a" * 64,
                "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
                "producedWidths": [320],
                "outcomeJobId": encode_uuid(uuid4()),
            },
        ),
        (
            AssetThumbnailOutcomeMarker,
            {
                "jobId": encode_uuid(uuid4()),
                "requestFingerprint": "f" * 64,
                "outputIdentity": "d" * 64,
                "sourceRevision": "a" * 64,
                "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
                "producedWidths": [320],
                "completedAt": "2026-07-15T09:30:00Z",
            },
        ),
    ],
)
def test_contracts_reject_transport_tenant_authority_and_secret_extras(
    extra_field: str,
    contract: type[BaseSchema],
    valid_payload: dict[str, object],
) -> None:
    payload = valid_payload | {extra_field: "must-not-cross-the-job-boundary"}

    with pytest.raises(ValidationError) as exc_info:
        contract.model_validate(payload)

    extra_error = next(error for error in exc_info.value.errors() if error["type"] == "extra_forbidden")
    assert extra_error["loc"] == (extra_field,)


def test_outcome_marker_requires_output_identity() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AssetThumbnailOutcomeMarker.model_validate({
            "jobId": encode_uuid(uuid4()),
            "requestFingerprint": "f" * 64,
            "sourceRevision": "a" * 64,
            "thumbnailProfileVersion": ASSET_THUMBNAIL_PROFILE_VERSION,
            "producedWidths": [320],
            "completedAt": "2026-07-15T09:30:00Z",
        })

    assert exc_info.value.errors()[0]["type"] == "missing"
    assert exc_info.value.errors()[0]["loc"] == ("outputIdentity",)


@pytest.mark.parametrize(
    "output_identity",
    ["D" * 64, "d" * 63, "g" * 64, f" {'d' * 64} "],
)
def test_outcome_marker_rejects_noncanonical_output_identity(output_identity: str) -> None:
    with pytest.raises(ValidationError):
        AssetThumbnailOutcomeMarker(
            job_id=uuid4(),
            request_fingerprint="f" * 64,
            output_identity=output_identity,
            source_revision="a" * 64,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=(320,),
            completed_at=datetime(2026, 7, 15, 9, 30, tzinfo=UTC),
        )


@pytest.mark.parametrize("version", [0, -1, "thumbnail-profile-v1"])
def test_thumbnail_profile_version_requires_a_positive_integer(version: object) -> None:
    with pytest.raises(ValidationError):
        AssetThumbnailJobInput.model_validate({
            "assetId": encode_uuid(uuid4()),
            "thumbnailProfileVersion": version,
        })


def test_target_input_validation_accepts_matching_asset_and_rejects_mismatch() -> None:
    asset_id = uuid4()
    target = _target(asset_id=asset_id)

    validate_asset_thumbnail_target_input(target=target, input_reference=_input(asset_id=asset_id))

    with pytest.raises(ValueError, match="entityId must match input assetId"):
        validate_asset_thumbnail_target_input(target=target, input_reference=_input(asset_id=uuid4()))


def test_result_semantic_validation_accepts_canonical_asset_job_source_and_profile() -> None:
    asset_id = uuid4()
    job_id = uuid4()
    source_revision = "a" * 64
    target = _target(asset_id=asset_id)
    input_reference = _input(asset_id=asset_id)
    result = AssetThumbnailJobResult(
        asset_id=asset_id,
        source_revision=source_revision,
        thumbnail_profile_version=input_reference.thumbnail_profile_version,
        produced_widths=(320, 640),
        outcome_job_id=job_id,
    )

    validate_asset_thumbnail_result_semantics(
        JobResultSemanticContext(
            job_id=job_id,
            source_revision=source_revision,
            target=target,
            input_reference=input_reference,
            result_reference=result,
        )
    )


def test_source_revision_prefers_checksum_and_falls_back_to_asset_id() -> None:
    asset_id = uuid4()

    uppercase_checksum = "A1" * 32
    assert (
        build_asset_thumbnail_source_revision(
            asset_id=asset_id,
            checksum_sha256=f"  {uppercase_checksum}  ",
        )
        == uppercase_checksum.lower()
    )
    assert build_asset_thumbnail_source_revision(asset_id=asset_id, checksum_sha256=None) == f"asset-id:{asset_id}"


@pytest.mark.parametrize("checksum", ["", " ", "abc123", "g" * 64, "a" * 63, "a" * 65])
def test_source_revision_rejects_invalid_non_null_checksum(checksum: str) -> None:
    with pytest.raises(ValueError, match="64 hexadecimal characters"):
        build_asset_thumbnail_source_revision(asset_id=uuid4(), checksum_sha256=checksum)


@pytest.mark.parametrize(
    ("widths", "message"),
    [
        ((0,), "positive widths"),
        ((-1,), "positive widths"),
        ((320, 320), "unique widths"),
        ((640, 320), "ascending order"),
    ],
)
def test_result_rejects_invalid_produced_widths(widths: tuple[int, ...], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        AssetThumbnailJobResult(
            asset_id=uuid4(),
            source_revision="a" * 64,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=widths,
            outcome_job_id=uuid4(),
        )


def test_result_rejects_empty_produced_widths() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AssetThumbnailJobResult(
            asset_id=uuid4(),
            source_revision="a" * 64,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
            produced_widths=(),
            outcome_job_id=uuid4(),
        )

    assert exc_info.value.errors()[0]["type"] == "too_short"


def test_definition_builder_injects_execution_policy_and_uses_canonical_authority() -> None:
    policy = AssetThumbnailExecutionPolicy(
        retry_policy=JobRetryPolicy(
            max_attempts=4,
            initial_delay_seconds=7,
            multiplier=2,
            maximum_delay_seconds=90,
            retryable_codes=ASSET_THUMBNAIL_RETRYABLE_CODES,
        ),
        timeout_seconds=240,
        lease_seconds=90,
        heartbeat_seconds=30,
    )

    definition = build_asset_thumbnail_job_definition(execution_policy=policy)

    assert definition.job_type == ASSET_THUMBNAIL_JOB_TYPE
    assert definition.job_type_version == ASSET_THUMBNAIL_JOB_TYPE_VERSION
    assert definition.task_name == ASSET_THUMBNAIL_TASK_NAME
    assert definition.workload_class == ASSET_THUMBNAIL_JOB_WORKLOAD == JobWorkloadClass.ASSET_CPU
    assert definition.target_scope == JobTargetScope.PROJECT
    assert definition.visibility == JobVisibility.PROJECT
    assert definition.authority_mode == JobAuthorityMode.SYSTEM_SERVICE
    assert definition.required_permission is None
    assert definition.manage_permission is not None
    assert definition.manage_permission.scope == JobPermissionScope.WORKSPACE
    assert definition.manage_permission.action == "system:assets:manage"
    assert definition.retry_class == JobRetryClass.TRANSIENT
    assert definition.cancellable_phases == frozenset({
        "queued",
        "resolving",
        "rendering_preview",
        "generating",
        "uploading",
        "persisting",
    })
    assert definition.retry_policy is policy.retry_policy
    assert definition.max_attempts == policy.retry_policy.max_attempts
    assert definition.timeout_seconds == policy.timeout_seconds
    assert definition.lease_seconds == policy.lease_seconds
    assert definition.heartbeat_seconds == policy.heartbeat_seconds
    assert definition.target_schema is AssetThumbnailJobTarget
    assert definition.input_reference_schema is AssetThumbnailJobInput
    assert definition.result_reference_schema is AssetThumbnailJobResult
    assert definition.cross_field_validator is validate_asset_thumbnail_target_input
    assert definition.result_semantic_validator is validate_asset_thumbnail_result_semantics


def test_persistence_outage_is_a_declared_retryable_terminal_failure() -> None:
    matching_contracts = tuple(
        contract
        for contract in ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS
        if contract.code == ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE
    )

    assert ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE in ASSET_THUMBNAIL_RETRYABLE_CODES
    assert len(matching_contracts) == 1
    assert matching_contracts[0].metadata_schema is None


def test_execution_policy_rejects_unknown_values() -> None:
    with pytest.raises(ValidationError) as exc_info:
        AssetThumbnailExecutionPolicy.model_validate({
            "maxAttempts": 3,
            "retryPolicy": {
                "maxAttempts": 3,
                "initialDelaySeconds": 5,
                "multiplier": 2,
                "maximumDelaySeconds": 60,
                "retryableCodes": list(ASSET_THUMBNAIL_RETRYABLE_CODES),
            },
            "timeoutSeconds": 120,
            "leaseSeconds": 90,
            "heartbeatSeconds": 30,
            "queueName": "asset-cpu",
        })

    assert exc_info.value.errors()[0]["type"] == "extra_forbidden"


def test_execution_policy_rejects_retry_codes_outside_the_handler_contract() -> None:
    with pytest.raises(ValidationError, match="owned by the handler contract"):
        AssetThumbnailExecutionPolicy(
            retry_policy=JobRetryPolicy(
                max_attempts=3,
                initial_delay_seconds=5,
                multiplier=2,
                maximum_delay_seconds=60,
                retryable_codes=ASSET_THUMBNAIL_RETRYABLE_CODES | {"ASSET_THUMBNAIL_DECODE_FAILED"},
            ),
            timeout_seconds=None,
            lease_seconds=90,
            heartbeat_seconds=30,
        )
