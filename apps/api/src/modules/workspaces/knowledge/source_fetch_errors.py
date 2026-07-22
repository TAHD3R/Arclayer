from __future__ import annotations

KNOWLEDGE_SOURCE_URL_FORBIDDEN = "KNOWLEDGE_SOURCE_URL_FORBIDDEN"
KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED = "KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED"
KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE = "KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE"
KNOWLEDGE_SOURCE_FETCH_FAILED = "KNOWLEDGE_SOURCE_FETCH_FAILED"
KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID = "KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID"
KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE = "KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE"


class KnowledgeSourceFetchError(RuntimeError):
    """Typed safe failure surfaced to the durable ingestion Job."""

    def __init__(
        self,
        *,
        code: str,
        safe_message: str,
        transient: bool,
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message
        self.transient = transient
        self.retry_after_seconds = retry_after_seconds
