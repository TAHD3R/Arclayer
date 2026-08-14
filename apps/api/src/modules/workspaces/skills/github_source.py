from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Literal
from urllib.parse import quote, urlsplit, urlunsplit

import orjson
from pydantic import BaseModel, ConfigDict, Field

from src.modules.workspaces.skills.manifest import normalize_skill_resource_path
from src.modules.workspaces.skills.package_metadata import SkillPackageMetadata

_REPOSITORY_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]+$")
_GIT_SHA = r"^[0-9a-f]{40}$"


class GitHubSourceError(ValueError):
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


class GitHubRepositoryIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    owner: str
    repository: str
    repository_url: str

    def api_url(self, suffix: str) -> str:
        return f"https://api.github.com/repos/{quote(self.owner)}/{quote(self.repository)}/{suffix}"


class GitHubTreeResource(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    path: str
    blob_sha: str = Field(pattern=_GIT_SHA)
    byte_size: int = Field(ge=1)
    mime_type: Literal["text/markdown", "text/plain", "application/json"]
    content: str


class GitHubSkillSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    repository_url: str
    requested_ref: str
    subpath: str
    resolved_commit: str = Field(pattern=_GIT_SHA)
    resolved_tree: str = Field(pattern=_GIT_SHA)
    metadata: SkillPackageMetadata | None = None
    resources: tuple[GitHubTreeResource, ...] = Field(min_length=1)


class GitHubPackageSourceDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["github"] = "github"
    repository_url: str
    requested_ref: str
    subpath: str
    latest_resolved_commit: str | None = Field(default=None, pattern=_GIT_SHA)
    latest_resolved_tree: str | None = Field(default=None, pattern=_GIT_SHA)


def normalize_github_repository_url(value: str) -> GitHubRepositoryIdentity:
    candidate = value.strip()
    if not candidate or "\\" in candidate or any(_is_control(character) for character in candidate):
        raise ValueError("GitHub repository URL is invalid")
    try:
        parsed = urlsplit(candidate)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("GitHub repository URL is invalid") from exc
    if (
        parsed.scheme.lower() != "https"
        or (parsed.hostname or "").lower() != "github.com"
        or port not in {None, 443}
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Only public https://github.com repository URLs are supported")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 2:
        raise ValueError("GitHub repository URL must identify one repository root")
    owner, repository = parts
    repository = repository[:-4] if repository.lower().endswith(".git") else repository
    if not _REPOSITORY_SEGMENT.fullmatch(owner) or not _REPOSITORY_SEGMENT.fullmatch(repository):
        raise ValueError("GitHub repository identity is invalid")
    owner = owner.lower()
    repository = repository.lower()
    return GitHubRepositoryIdentity(
        owner=owner,
        repository=repository,
        repository_url=urlunsplit(("https", "github.com", f"/{owner}/{repository}", "", "")),
    )


def normalize_github_ref(value: str) -> str:
    ref = unicodedata.normalize("NFC", value).strip()
    parts = ref.split("/")
    if (
        not ref
        or len(ref) > 256
        or ref.startswith("/")
        or ref.endswith(("/", "."))
        or "\\" in ref
        or ".." in ref
        or "@{" in ref
        or any(_is_control(character) or character in " ~^:?*[" for character in ref)
        or any(not part or part.startswith(".") or part.endswith(".lock") for part in parts)
    ):
        raise ValueError("GitHub ref is invalid")
    return ref


def normalize_github_subpath(value: str | None) -> str:
    candidate = unicodedata.normalize("NFC", (value or "").strip()).strip("/")
    if not candidate:
        return ""
    return normalize_skill_resource_path(candidate)


def build_github_request_revision(
    *,
    operation: str,
    repository_url: str,
    requested_ref: str | None = None,
    subpath: str | None = None,
    slug: str | None = None,
    display_name: str | None = None,
    description: str | None = None,
    package_id: str | None = None,
) -> str:
    values = {
        "operation": operation,
        "repositoryUrl": repository_url,
        "requestedRef": requested_ref,
        "subpath": subpath,
        "slug": slug,
        "displayName": display_name,
        "description": description,
        "packageId": package_id,
    }
    payload = orjson.dumps(
        {key: value for key, value in values.items() if value is not None},
        option=orjson.OPT_SORT_KEYS,
    )
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def _is_control(character: str) -> bool:
    code = ord(character)
    return code < 32 or code == 127
