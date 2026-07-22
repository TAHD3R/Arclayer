from __future__ import annotations

import base64
import hashlib
from typing import Literal, NoReturn
from urllib.parse import quote

import httpx
import orjson
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.config import SkillGitHubFetchSettings
from src.modules.workspaces.knowledge.untrusted_http_transport import VettedAsyncHttpTransport
from src.modules.workspaces.knowledge.untrusted_url import PublicAddressResolver, SystemPublicAddressResolver
from src.modules.workspaces.skills.github_import_contract import (
    SKILL_GITHUB_CONFIGURATION_INVALID,
    SKILL_GITHUB_LIMIT_EXCEEDED,
    SKILL_GITHUB_RESPONSE_INVALID,
    SKILL_GITHUB_SOURCE_CONFLICT,
    SKILL_GITHUB_SOURCE_INVALID,
    SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
)
from src.modules.workspaces.skills.github_source import (
    GitHubRepositoryIdentity,
    GitHubSkillSnapshot,
    GitHubSourceError,
    GitHubTreeResource,
    normalize_github_repository_url,
    normalize_github_subpath,
)
from src.modules.workspaces.skills.manifest import normalize_skill_resource_path

_TRANSIENT_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_COMMIT_RESPONSE_LIMIT = 256 * 1024


class _GitTreePointer(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    sha: str = Field(pattern=r"^[0-9a-f]{40}$")


class _GitCommitBody(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    tree: _GitTreePointer


class _GitCommitResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    commit: _GitCommitBody


class _GitTreeEntry(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    path: str = Field(min_length=1, max_length=4096)
    mode: str = Field(pattern=r"^[0-9]{6}$")
    type: Literal["blob", "tree", "commit"]
    sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    size: int | None = Field(default=None, ge=0)


class _GitTreeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    truncated: bool
    tree: tuple[_GitTreeEntry, ...]


class _GitBlobResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    sha: str = Field(pattern=r"^[0-9a-f]{40}$")
    size: int = Field(ge=0)
    encoding: Literal["base64"]
    content: str


class PublicGitHubSkillFetcher:
    """Fetch a bounded, commit-pinned public repository snapshot without executing it."""

    def __init__(
        self,
        *,
        policy: SkillGitHubFetchSettings,
        resolver: PublicAddressResolver | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._policy = policy
        self._resolver = resolver or SystemPublicAddressResolver()
        self._transport = transport

    async def fetch(
        self,
        *,
        repository_url: str,
        requested_ref: str,
        subpath: str,
    ) -> GitHubSkillSnapshot:
        if not self._policy.enabled:
            raise GitHubSourceError(
                code=SKILL_GITHUB_CONFIGURATION_INVALID,
                safe_message="GitHub Skill import is disabled by deployment policy",
                transient=False,
            )
        try:
            repository = normalize_github_repository_url(repository_url)
            normalized_subpath = normalize_github_subpath(subpath)
        except ValueError as exc:
            raise GitHubSourceError(
                code=SKILL_GITHUB_SOURCE_INVALID,
                safe_message="GitHub repository source is invalid",
                transient=False,
            ) from exc
        transport = self._transport or VettedAsyncHttpTransport(resolver=self._resolver)
        timeout = httpx.Timeout(
            connect=self._policy.connect_timeout_seconds,
            read=self._policy.read_timeout_seconds,
            write=self._policy.connect_timeout_seconds,
            pool=self._policy.connect_timeout_seconds,
        )
        async with httpx.AsyncClient(
            transport=transport,
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
        ) as client:
            commit = _validate_response(
                _GitCommitResponse,
                await self._request_json(
                    client=client,
                    url=repository.api_url(f"commits/{quote(requested_ref, safe='')}"),
                    byte_limit=_COMMIT_RESPONSE_LIMIT,
                ),
            )
            tree = _validate_response(
                _GitTreeResponse,
                await self._request_json(
                    client=client,
                    url=repository.api_url(f"git/trees/{commit.commit.tree.sha}?recursive=1"),
                    byte_limit=self._policy.max_tree_response_bytes,
                ),
            )
            entries = self._select_entries(tree=tree, expected_tree=commit.commit.tree.sha, subpath=normalized_subpath)
            resources: list[GitHubTreeResource] = []
            for entry, relative_path in entries:
                resources.append(
                    await self._fetch_resource(
                        client=client,
                        repository=repository,
                        entry=entry,
                        relative_path=relative_path,
                    )
                )
        return GitHubSkillSnapshot(
            repository_url=repository.repository_url,
            requested_ref=requested_ref,
            subpath=normalized_subpath,
            resolved_commit=commit.sha,
            resolved_tree=tree.sha,
            resources=tuple(resources),
        )

    def _select_entries(
        self,
        *,
        tree: _GitTreeResponse,
        expected_tree: str,
        subpath: str,
    ) -> tuple[tuple[_GitTreeEntry, str], ...]:
        if tree.sha != expected_tree or tree.truncated:
            self._raise(SKILL_GITHUB_SOURCE_CONFLICT, "GitHub returned an incomplete or conflicting repository tree")
        prefix = f"{subpath}/" if subpath else ""
        selected: list[tuple[_GitTreeEntry, str]] = []
        seen: set[str] = set()
        total_bytes = 0
        for entry in tree.tree:
            if prefix and not entry.path.startswith(prefix):
                continue
            relative_path = entry.path[len(prefix) :] if prefix else entry.path
            if not relative_path:
                continue
            if entry.type == "tree":
                continue
            if entry.type == "commit" or entry.mode in {"120000", "160000"}:
                self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill packages cannot contain symlinks or submodules")
            try:
                normalized = normalize_skill_resource_path(relative_path)
            except ValueError:
                self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill resource path is invalid")
            if normalized != relative_path or len(normalized.split("/")) > self._policy.max_tree_depth:
                self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill resource path escapes the package boundary")
            folded = normalized.casefold()
            if folded in seen:
                self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill resource paths have a case collision")
            if entry.size is None or entry.size < 1 or entry.size > self._policy.max_file_bytes:
                self._raise(SKILL_GITHUB_LIMIT_EXCEEDED, "GitHub Skill resource exceeds the per-file boundary")
            seen.add(folded)
            total_bytes += entry.size
            selected.append((entry, normalized))
        if "SKILL.md" not in {path for _entry, path in selected}:
            self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill package must contain SKILL.md at its package root")
        if len(selected) > self._policy.max_files or total_bytes > self._policy.max_total_bytes:
            self._raise(SKILL_GITHUB_LIMIT_EXCEEDED, "GitHub Skill package exceeds its resource boundary")
        return tuple(sorted(selected, key=lambda item: item[1]))

    async def _fetch_resource(
        self,
        *,
        client: httpx.AsyncClient,
        repository: GitHubRepositoryIdentity,
        entry: _GitTreeEntry,
        relative_path: str,
    ) -> GitHubTreeResource:
        response_limit = self._policy.max_file_bytes * 2 + 65_536
        blob = _validate_response(
            _GitBlobResponse,
            await self._request_json(
                client=client,
                url=repository.api_url(f"git/blobs/{entry.sha}"),
                byte_limit=response_limit,
            ),
        )
        if blob.sha != entry.sha or blob.size != entry.size:
            self._raise(SKILL_GITHUB_SOURCE_CONFLICT, "GitHub blob identity differs from the pinned repository tree")
        try:
            encoded = "".join(blob.content.split()).encode("ascii")
            content_bytes = base64.b64decode(encoded, validate=True)
        except (UnicodeEncodeError, ValueError):
            self._raise(SKILL_GITHUB_RESPONSE_INVALID, "GitHub returned invalid blob encoding")
        if len(content_bytes) != blob.size or _git_blob_sha(content_bytes) != blob.sha:
            self._raise(SKILL_GITHUB_SOURCE_CONFLICT, "GitHub blob content failed immutable identity verification")
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill resources must contain inert UTF-8 text")
        if any(ord(character) < 32 and character not in "\t\n\r" for character in content):
            self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub Skill resource contains unsupported control bytes")
        mime_type = _resource_mime_type(path=relative_path, content_bytes=content_bytes)
        return GitHubTreeResource(
            path=relative_path,
            blob_sha=blob.sha,
            byte_size=blob.size,
            mime_type=mime_type,
            content=content,
        )

    async def _request_json(
        self,
        *,
        client: httpx.AsyncClient,
        url: str,
        byte_limit: int,
    ) -> object:
        try:
            async with client.stream(
                "GET",
                url,
                headers={
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": self._policy.user_agent,
                },
            ) as response:
                self._require_status(response)
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > byte_limit:
                        self._raise(SKILL_GITHUB_LIMIT_EXCEEDED, "GitHub response exceeds its bounded fetch capacity")
        except GitHubSourceError:
            raise
        except httpx.TimeoutException as exc:
            raise GitHubSourceError(
                code=SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
                safe_message="GitHub request timed out",
                transient=True,
            ) from exc
        except httpx.NetworkError as exc:
            raise GitHubSourceError(
                code=SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
                safe_message="GitHub is temporarily unavailable",
                transient=True,
            ) from exc
        except httpx.HTTPError as exc:
            raise GitHubSourceError(
                code=SKILL_GITHUB_RESPONSE_INVALID,
                safe_message="GitHub returned an invalid HTTP response",
                transient=False,
            ) from exc
        try:
            return orjson.loads(body)
        except orjson.JSONDecodeError as exc:
            raise GitHubSourceError(
                code=SKILL_GITHUB_RESPONSE_INVALID,
                safe_message="GitHub returned invalid JSON",
                transient=False,
            ) from exc

    def _require_status(self, response: httpx.Response) -> None:
        if response.status_code == 200:
            return
        if response.status_code in _REDIRECT_STATUSES:
            self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub API redirects are forbidden")
        if response.status_code in _TRANSIENT_STATUSES or (
            response.status_code == 403 and response.headers.get("x-ratelimit-remaining") == "0"
        ):
            raise GitHubSourceError(
                code=SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
                safe_message="GitHub is temporarily unavailable",
                transient=True,
                retry_after_seconds=_retry_after_seconds(response.headers.get("retry-after")),
            )
        self._raise(SKILL_GITHUB_SOURCE_INVALID, "GitHub repository, ref, or object is unavailable")

    @staticmethod
    def _raise(code: str, message: str) -> NoReturn:
        raise GitHubSourceError(code=code, safe_message=message, transient=False)


def _resource_mime_type(
    *,
    path: str,
    content_bytes: bytes,
) -> Literal["text/markdown", "text/plain", "application/json"]:
    lower_path = path.lower()
    if lower_path.endswith(".json"):
        try:
            orjson.loads(content_bytes)
        except orjson.JSONDecodeError as exc:
            raise GitHubSourceError(
                code=SKILL_GITHUB_SOURCE_INVALID,
                safe_message="GitHub Skill JSON resource is invalid",
                transient=False,
            ) from exc
        return "application/json"
    if lower_path.endswith((".md", ".mdx")):
        return "text/markdown"
    return "text/plain"


def _validate_response[T: BaseModel](schema: type[T], payload: object) -> T:
    try:
        return schema.model_validate(payload)
    except ValidationError as exc:
        raise GitHubSourceError(
            code=SKILL_GITHUB_RESPONSE_INVALID,
            safe_message="GitHub response does not match the required contract",
            transient=False,
        ) from exc


def _git_blob_sha(content: bytes) -> str:
    return hashlib.sha1(f"blob {len(content)}\0".encode() + content, usedforsecurity=False).hexdigest()


def _retry_after_seconds(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        seconds = int(value)
    except ValueError:
        return None
    return float(seconds) if 0 <= seconds <= 3600 else None
