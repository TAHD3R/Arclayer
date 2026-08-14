from __future__ import annotations

import base64
import hashlib
from collections.abc import Callable
from uuid import uuid4

import httpx
import pytest

from src.config import SkillGitHubFetchSettings
from src.modules.workspaces.skills.github_authoring import build_github_skill_version
from src.modules.workspaces.skills.github_fetcher import PublicGitHubSkillFetcher
from src.modules.workspaces.skills.github_import_contract import (
    SKILL_GITHUB_DEFAULT_BRANCH_UNAVAILABLE,
    SKILL_GITHUB_METADATA_INVALID,
    SKILL_GITHUB_RESPONSE_INVALID,
    SKILL_GITHUB_SKILL_ROOT_AMBIGUOUS,
    SKILL_GITHUB_SKILL_ROOT_NOT_FOUND,
    SKILL_GITHUB_SOURCE_CONFLICT,
    SKILL_GITHUB_SOURCE_INVALID,
    SKILL_GITHUB_TEMPORARILY_UNAVAILABLE,
)
from src.modules.workspaces.skills.github_source import (
    GitHubSourceError,
    normalize_github_ref,
    normalize_github_repository_url,
    normalize_github_subpath,
)
from src.modules.workspaces.skills.manifest import validate_skill_package_checksum
from src.modules.workspaces.skills.package_metadata import SkillPackageMetadata

_COMMIT_SHA = "1" * 40
_TREE_SHA = "2" * 40


def _blob_sha(content: bytes) -> str:
    return hashlib.sha1(f"blob {len(content)}\0".encode() + content, usedforsecurity=False).hexdigest()


def _blob_response(content: bytes) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "sha": _blob_sha(content),
            "size": len(content),
            "encoding": "base64",
            "content": base64.b64encode(content).decode(),
        },
    )


def _entry(path: str, content: bytes, *, mode: str = "100644", entry_type: str = "blob") -> dict[str, object]:
    return {
        "path": path,
        "mode": mode,
        "type": entry_type,
        "sha": _blob_sha(content),
        "size": len(content),
    }


def _transport(
    entries: list[dict[str, object]],
    contents: dict[str, bytes],
    *,
    tree_sha: str = _TREE_SHA,
    truncated: bool = False,
    repository_payload: object | None = None,
) -> tuple[httpx.MockTransport, list[str]]:
    requests: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        requests.append(url)
        if request.url.path == "/repos/acme/site-skill/":
            return httpx.Response(
                200,
                json={"default_branch": "main"} if repository_payload is None else repository_payload,
            )
        if "/commits/" in url:
            return httpx.Response(200, json={"sha": _COMMIT_SHA, "commit": {"tree": {"sha": _TREE_SHA}}})
        if "/git/trees/" in url:
            return httpx.Response(200, json={"sha": tree_sha, "truncated": truncated, "tree": entries})
        blob_sha = request.url.path.rsplit("/", 1)[-1]
        return _blob_response(contents[blob_sha])

    return httpx.MockTransport(respond), requests


@pytest.mark.parametrize(
    "value",
    (
        "http://github.com/acme/skill",
        "https://user:token@github.com/acme/skill",
        "https://gitlab.com/acme/skill",
        "https://github.com/acme/skill/tree/main",
        "git@github.com:acme/skill.git",
    ),
)
def test_github_repository_normalization_accepts_only_public_repository_roots(value: str) -> None:
    with pytest.raises(ValueError):
        normalize_github_repository_url(value)


def test_github_source_normalization_is_canonical_and_rejects_escaping_values() -> None:
    repository = normalize_github_repository_url("HTTPS://GitHub.com:443/Acme/Site-Skill.git")

    assert repository.owner == "acme"
    assert repository.repository == "site-skill"
    assert repository.repository_url == "https://github.com/acme/site-skill"
    assert normalize_github_ref(" feature/site-builder ") == "feature/site-builder"
    assert normalize_github_subpath(" /skills/designer/ ") == "skills/designer"

    for invalid_ref in ("../main", "refs/heads/main.lock", "feature//builder", "main~1"):
        with pytest.raises(ValueError):
            normalize_github_ref(invalid_ref)
    with pytest.raises(ValueError):
        normalize_github_subpath("skills/../private")


@pytest.mark.asyncio
async def test_fetcher_discovers_one_skill_on_the_default_branch_and_parses_metadata() -> None:
    metadata = b'{"slug":"site-planner","displayName":"Site Planner","description":"Plan a site."}'
    instructions = b"# Site Planner\n\nBuild a sitemap.\n"
    entries = [
        _entry("skills/site/skill.json", metadata),
        _entry("skills/site/SKILL.md", instructions),
    ]
    contents = {_blob_sha(metadata): metadata, _blob_sha(instructions): instructions}
    transport, requests = _transport(entries, contents)
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    snapshot = await fetcher.fetch(repository_url="https://github.com/acme/site-skill")

    assert snapshot.requested_ref == "main"
    assert snapshot.subpath == "skills/site"
    assert snapshot.metadata is not None
    assert snapshot.metadata.slug == "site-planner"
    assert [resource.path for resource in snapshot.resources] == ["SKILL.md"]
    assert requests[0].endswith("/repos/acme/site-skill/")


@pytest.mark.asyncio
async def test_fetcher_rejects_more_than_one_discoverable_skill_root() -> None:
    metadata = b'{"slug":"site-planner","displayName":"Site Planner","description":"Plan a site."}'
    instructions = b"# Skill\n"
    entries = [
        _entry("one/skill.json", metadata),
        _entry("one/SKILL.md", instructions),
        _entry("two/skill.json", metadata),
        _entry("two/SKILL.md", instructions),
    ]
    transport, _ = _transport(
        entries,
        {_blob_sha(metadata): metadata, _blob_sha(instructions): instructions},
    )
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/site-skill")

    assert raised.value.code == SKILL_GITHUB_SKILL_ROOT_AMBIGUOUS


@pytest.mark.parametrize("repository_payload", ({}, {"default_branch": None}, {"default_branch": ""}))
@pytest.mark.asyncio
async def test_fetcher_reports_an_unavailable_default_branch(repository_payload: object) -> None:
    transport, _ = _transport([], {}, repository_payload=repository_payload)
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/site-skill")

    assert raised.value.code == SKILL_GITHUB_DEFAULT_BRANCH_UNAVAILABLE


@pytest.mark.asyncio
async def test_fetcher_requires_one_discoverable_skill_root() -> None:
    transport, _ = _transport([_entry("README.md", b"# Repository\n")], {})
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/site-skill")

    assert raised.value.code == SKILL_GITHUB_SKILL_ROOT_NOT_FOUND


@pytest.mark.asyncio
async def test_fetcher_rejects_invalid_skill_package_metadata() -> None:
    metadata = b'{"slug":"Site Planner","displayName":"Site Planner","description":"Plan a site."}'
    instructions = b"# Site Planner\n"
    entries = [_entry("skill.json", metadata), _entry("SKILL.md", instructions)]
    contents = {_blob_sha(metadata): metadata, _blob_sha(instructions): instructions}
    transport, _ = _transport(entries, contents)
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/site-skill")

    assert raised.value.code == SKILL_GITHUB_METADATA_INVALID


@pytest.mark.asyncio
async def test_fetcher_pins_commit_tree_and_exact_blob_evidence_without_executing_repository_code() -> None:
    skill = b"# Site design\n\nProduce a sitemap and wireframe.\n"
    reference = b'{"tone":"editorial"}'
    script = b"raise RuntimeError('must never execute')\n"
    entries = [
        _entry("packages/site/SKILL.md", skill),
        _entry("packages/site/references/style.json", reference),
        _entry("packages/site/scripts/build.py", script),
        _entry("README.md", b"outside package"),
    ]
    contents = {
        _blob_sha(skill): skill,
        _blob_sha(reference): reference,
        _blob_sha(script): script,
    }
    transport, requests = _transport(entries, contents)
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    snapshot = await fetcher.fetch(
        repository_url="https://github.com/Acme/Site-Skill",
        requested_ref="feature/site-builder",
        subpath="packages/site",
    )

    assert snapshot.repository_url == "https://github.com/acme/site-skill"
    assert snapshot.resolved_commit == _COMMIT_SHA
    assert snapshot.resolved_tree == _TREE_SHA
    assert [resource.path for resource in snapshot.resources] == [
        "SKILL.md",
        "references/style.json",
        "scripts/build.py",
    ]
    assert [resource.mime_type for resource in snapshot.resources] == [
        "text/markdown",
        "application/json",
        "text/plain",
    ]
    assert "/commits/feature%2Fsite-builder" in requests[0]
    assert f"/git/trees/{_TREE_SHA}?recursive=1" in requests[1]
    assert all("raw.githubusercontent.com" not in request for request in requests)

    authored = build_github_skill_version(
        workspace_id=uuid4(),
        snapshot=snapshot.model_copy(
            update={
                "metadata": SkillPackageMetadata(
                    slug="site-designer",
                    display_name="Site Designer",
                    description="Plans a site from verified repository instructions.",
                )
            }
        ),
    )
    validate_skill_package_checksum(authored.manifest)
    assert authored.manifest.publisher.id == "github:acme/site-skill"
    assert authored.manifest.publisher.verified is False
    assert authored.manifest.required_tools == ()
    assert authored.manifest.permissions == ()
    assert authored.manifest.data_egress == ()
    assert authored.resources[-1].content == script.decode()


@pytest.mark.parametrize(
    ("mutate", "expected_code"),
    (
        (lambda entries: entries + [_entry("skill.md", b"collision")], SKILL_GITHUB_SOURCE_INVALID),
        (
            lambda entries: entries + [_entry("link", b"target", mode="120000")],
            SKILL_GITHUB_SOURCE_INVALID,
        ),
        (
            lambda entries: [entry for entry in entries if entry["path"] != "SKILL.md"],
            SKILL_GITHUB_SOURCE_INVALID,
        ),
    ),
)
@pytest.mark.asyncio
async def test_fetcher_rejects_ambiguous_or_executable_repository_structures(
    mutate: Callable[[list[dict[str, object]]], list[dict[str, object]]],
    expected_code: str,
) -> None:
    skill = b"# Skill\n"
    entries = mutate([_entry("SKILL.md", skill)])
    transport, _requests = _transport(entries, {_blob_sha(skill): skill})
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/skill", requested_ref="main", subpath="")

    assert raised.value.code == expected_code
    assert raised.value.transient is False


@pytest.mark.asyncio
async def test_fetcher_rejects_truncated_tree_and_blob_identity_mismatch() -> None:
    skill = b"# Skill\n"
    entries = [_entry("SKILL.md", skill)]
    truncated_transport, _ = _transport(entries, {_blob_sha(skill): skill}, truncated=True)
    truncated_fetcher = PublicGitHubSkillFetcher(
        policy=SkillGitHubFetchSettings(),
        transport=truncated_transport,
    )

    with pytest.raises(GitHubSourceError) as truncated:
        await truncated_fetcher.fetch(
            repository_url="https://github.com/acme/skill",
            requested_ref="main",
            subpath="",
        )
    assert truncated.value.code == SKILL_GITHUB_SOURCE_CONFLICT

    def mismatched_blob(request: httpx.Request) -> httpx.Response:
        if "/commits/" in str(request.url):
            return httpx.Response(200, json={"sha": _COMMIT_SHA, "commit": {"tree": {"sha": _TREE_SHA}}})
        if "/git/trees/" in str(request.url):
            return httpx.Response(200, json={"sha": _TREE_SHA, "truncated": False, "tree": entries})
        return httpx.Response(
            200,
            json={
                "sha": _blob_sha(skill),
                "size": len(skill),
                "encoding": "base64",
                "content": base64.b64encode(b"# Other\n").decode(),
            },
        )

    mismatch_fetcher = PublicGitHubSkillFetcher(
        policy=SkillGitHubFetchSettings(),
        transport=httpx.MockTransport(mismatched_blob),
    )
    with pytest.raises(GitHubSourceError) as mismatch:
        await mismatch_fetcher.fetch(
            repository_url="https://github.com/acme/skill",
            requested_ref="main",
            subpath="",
        )
    assert mismatch.value.code == SKILL_GITHUB_SOURCE_CONFLICT


@pytest.mark.asyncio
async def test_fetcher_rejects_redirects_and_classifies_rate_limit_as_transient() -> None:
    redirect = PublicGitHubSkillFetcher(
        policy=SkillGitHubFetchSettings(),
        transport=httpx.MockTransport(lambda _request: httpx.Response(302, headers={"location": "https://evil.test"})),
    )
    with pytest.raises(GitHubSourceError) as redirected:
        await redirect.fetch(repository_url="https://github.com/acme/skill", requested_ref="main", subpath="")
    assert redirected.value.code == SKILL_GITHUB_SOURCE_INVALID
    assert redirected.value.transient is False

    rate_limited = PublicGitHubSkillFetcher(
        policy=SkillGitHubFetchSettings(),
        transport=httpx.MockTransport(
            lambda _request: httpx.Response(
                429,
                headers={"retry-after": "12"},
                json={"message": "rate limited"},
            )
        ),
    )
    with pytest.raises(GitHubSourceError) as limited:
        await rate_limited.fetch(repository_url="https://github.com/acme/skill", requested_ref="main", subpath="")
    assert limited.value.code == SKILL_GITHUB_TEMPORARILY_UNAVAILABLE
    assert limited.value.transient is True
    assert limited.value.retry_after_seconds == 12


@pytest.mark.asyncio
async def test_fetcher_rejects_invalid_json_resource_content() -> None:
    skill = b"# Skill\n"
    invalid_json = b"{not-json}"
    entries = [_entry("SKILL.md", skill), _entry("references/schema.json", invalid_json)]
    contents = {_blob_sha(skill): skill, _blob_sha(invalid_json): invalid_json}
    transport, _ = _transport(entries, contents)
    fetcher = PublicGitHubSkillFetcher(policy=SkillGitHubFetchSettings(), transport=transport)

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/skill", requested_ref="main", subpath="")

    assert raised.value.code == SKILL_GITHUB_SOURCE_INVALID


@pytest.mark.asyncio
async def test_fetcher_rejects_invalid_external_response_contract() -> None:
    fetcher = PublicGitHubSkillFetcher(
        policy=SkillGitHubFetchSettings(),
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={"unexpected": True})),
    )

    with pytest.raises(GitHubSourceError) as raised:
        await fetcher.fetch(repository_url="https://github.com/acme/skill", requested_ref="main", subpath="")

    assert raised.value.code == SKILL_GITHUB_RESPONSE_INVALID
