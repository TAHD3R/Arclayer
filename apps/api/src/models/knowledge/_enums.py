from __future__ import annotations

from enum import StrEnum


class KnowledgeBaseStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETING = "deleting"


class KnowledgeVisibility(StrEnum):
    WORKSPACE = "workspace"
    RESTRICTED = "restricted"


class KnowledgeSourceKind(StrEnum):
    MANUAL = "manual"
    FILE = "file"
    URL = "url"
    CONNECTOR = "connector"
    STRUCTURED_CONTENT = "structured_content"


class KnowledgeSourceStatus(StrEnum):
    PENDING = "pending"
    FETCHING = "fetching"
    PARSING = "parsing"
    INDEXING = "indexing"
    READY = "ready"
    STALE = "stale"
    FAILED = "failed"
    QUARANTINED = "quarantined"
    DISABLED = "disabled"
    DELETING = "deleting"


class KnowledgeVersionStatus(StrEnum):
    PENDING = "pending"
    FETCHING = "fetching"
    PARSING = "parsing"
    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"
    QUARANTINED = "quarantined"


class KnowledgeIngestionMode(StrEnum):
    INITIAL = "initial"
    REFRESH = "refresh"
    REPARSE = "reparse"
    REINDEX = "reindex"


class KnowledgeServingFreshness(StrEnum):
    CURRENT = "current"
    STALE = "stale"
