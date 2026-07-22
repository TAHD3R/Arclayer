from __future__ import annotations

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.schema import JobDispatchEnvelope


def validate_dispatch_envelope(
    *,
    dispatch: JobDispatchOutboxRecord,
    envelope: JobDispatchEnvelope,
) -> None:
    serialized_envelope = envelope.model_dump(mode="json", by_alias=True)
    if (
        envelope.job_id != dispatch.job_id
        or envelope.dispatch_sequence != dispatch.dispatch_sequence
        or envelope.workload_class != dispatch.workload_class
        or envelope.message_schema_version != dispatch.message_schema_version
        or serialized_envelope != dispatch.envelope
        or hash_json(serialized_envelope) != dispatch.envelope_hash
    ):
        raise _envelope_mismatch()


def validate_job_envelope(
    *,
    job: BackgroundJobRecord,
    task_name: str,
    envelope: JobDispatchEnvelope,
) -> None:
    if (
        envelope.job_id != job.id
        or envelope.job_type != job.job_type
        or envelope.job_type_version != job.job_type_version
        or envelope.workload_class != job.workload_class
        or task_name != job.task_name
        or envelope.target_descriptor != job.target_descriptor
        or envelope.request_fingerprint != job.request_fingerprint
    ):
        raise _envelope_mismatch()


def _envelope_mismatch() -> Conflict:
    return Conflict(
        message=t("errors", "BACKGROUND_JOB_DISPATCH_ENVELOPE_MISMATCH"),
        error="BACKGROUND_JOB_DISPATCH_ENVELOPE_MISMATCH",
    )
