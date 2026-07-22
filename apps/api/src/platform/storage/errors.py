from __future__ import annotations


class StorageProfileRouteInvariantError(RuntimeError):
    """Persisted storage profile identity or route evidence is internally inconsistent."""


class StorageProviderError(RuntimeError):
    """Base error for typed object-storage provider failures."""


class StorageObjectNotFoundError(StorageProviderError):
    """Raised when a provider definitively reports that an object is absent."""

    def __init__(self, *, provider: str, object_key: str) -> None:
        super().__init__(f"Object not found in {provider}: {object_key}")
        self.provider = provider
        self.object_key = object_key


class StorageAccessDeniedError(StorageProviderError):
    """Raised when credentials or permissions definitively reject an object operation."""

    def __init__(self, *, provider: str, operation: str, object_key: str) -> None:
        super().__init__(f"Storage provider denied {operation} in {provider}: {object_key}")
        self.provider = provider
        self.operation = operation
        self.object_key = object_key


class StorageRateLimitedError(StorageProviderError):
    """Raised when a provider explicitly throttles an object operation."""

    def __init__(
        self,
        *,
        provider: str,
        operation: str,
        object_key: str,
        retry_after_seconds: int | None,
    ) -> None:
        super().__init__(f"Storage provider rate limited {operation} in {provider}: {object_key}")
        self.provider = provider
        self.operation = operation
        self.object_key = object_key
        self.retry_after_seconds = retry_after_seconds


class StorageTemporarilyUnavailableError(StorageProviderError):
    """Raised when an object operation fails because the provider is temporarily unavailable."""

    def __init__(self, *, provider: str, operation: str, object_key: str) -> None:
        super().__init__(f"Storage provider temporarily unavailable for {operation} in {provider}: {object_key}")
        self.provider = provider
        self.operation = operation
        self.object_key = object_key


class StorageMultipartUploadNotFoundError(StorageProviderError):
    """Raised when a provider definitively reports an unknown multipart upload."""

    def __init__(self, *, provider: str, object_key: str, upload_id: str) -> None:
        super().__init__(f"Multipart upload not found in {provider}: {object_key} ({upload_id})")
        self.provider = provider
        self.object_key = object_key
        self.upload_id = upload_id
