from __future__ import annotations

from json import loads
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.models.projects.project import ProjectRecord
from src.modules.domains.service import DomainBindingService
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.modules.projects.settings.schema import ProjectSettingsDetail
from src.modules.projects.settings.service import ProjectSettingsService
from src.modules.projects.source.repository import ProjectSourceRepository
from src.modules.projects.source.schema import ProjectSourceFileUpsertIn
from src.modules.projects.source.service import ProjectSourceService


def _project() -> ProjectRecord:
    workspace_id = uuid4()
    project = ProjectRecord(
        id=uuid4(),
        workspace_id=workspace_id,
        slug="launch-site",
        name="Launch Site",
        description="Primary landing page",
    )
    project.workspace_id = workspace_id
    return project


class _FakeProjectRepository:
    def __init__(self, project: ProjectRecord) -> None:
        self.project = project
        self.project_ids: list[object] = []

    async def get_project_by_id(self, *, project_id):
        self.project_ids.append(project_id)
        return self.project


class _FakeSettingsService:
    def __init__(self, value: dict) -> None:
        self.value = value
        self.project_ids: list[object] = []

    async def get_core_detail(self, *, project_id):
        self.project_ids.append(project_id)
        return ProjectSettingsDetail(namespace="core", value=self.value, secrets={})


class _FakeRuntimeService:
    def __init__(self, *, project: ProjectRecord) -> None:
        self.project = project
        self.runtime_id = uuid4()
        self.site_id = uuid4()
        self.project_ids: list[object] = []

    async def get_context_by_project(self, *, project_id, actor_user_id):
        self.project_ids.append(project_id)
        return SimpleNamespace(
            runtime_id=self.runtime_id,
            project_id=project_id,
            workspace_id=self.project.workspace_id,
            site_id=self.site_id,
            kind="production",
            name="Production",
            slug=f"{self.project.slug}-site",
            default_locale="zh-CN",
            fallback_locale="en-US",
            is_active=True,
        )


class _FakeDomainService:
    def __init__(self, *, project: ProjectRecord, runtime_service: _FakeRuntimeService) -> None:
        self.project = project
        self.runtime_service = runtime_service
        self.project_ids: list[object] = []

    async def list_bindings_for_project(self, *, project_id):
        self.project_ids.append(project_id)
        return [
            SimpleNamespace(
                binding_id=uuid4(),
                hostname="launch-site.arclayer.localhost",
                source="platform",
                target_type="project_runtime",
                workspace_id=self.project.workspace_id,
                project_id=project_id,
                runtime_id=self.runtime_service.runtime_id,
                runtime_name="Production",
                site_id=self.runtime_service.site_id,
                environment_id=None,
                is_primary=True,
                is_verified=True,
                is_active=True,
                verification_token=None,
                verified_at_ms=1_725_000_000_000,
                certificate_status="platform_managed",
                created_by_user_id=None,
                dns=None,
            )
        ]

    def to_out(self, binding):
        return {
            "bindingId": binding.binding_id,
            "hostname": binding.hostname,
            "source": binding.source,
            "targetType": binding.target_type,
            "workspaceId": binding.workspace_id,
            "projectId": binding.project_id,
            "runtimeId": binding.runtime_id,
            "runtimeName": binding.runtime_name,
            "siteId": binding.site_id,
            "environmentId": binding.environment_id,
            "isPrimary": binding.is_primary,
            "isVerified": binding.is_verified,
            "isActive": binding.is_active,
            "verificationToken": binding.verification_token,
            "verifiedAtMs": binding.verified_at_ms,
            "certificateStatus": binding.certificate_status,
            "createdByUserId": binding.created_by_user_id,
            "dns": binding.dns,
        }


class _SourceRecord:
    def __init__(
        self,
        *,
        project_id,
        path: str,
        role: str,
        language: str,
        contents: str,
        is_deleted: bool = False,
    ) -> None:
        self.project_id = project_id
        self.path = path
        self.role = role
        self.language = language
        self.contents = contents
        self.is_deleted = is_deleted


class _FakeSourceRepository:
    def __init__(self, records: list[_SourceRecord] | None = None) -> None:
        self.records = records or []

    async def list_project_files(self, *, project_id):
        return [record for record in self.records if record.project_id == project_id]

    async def get_project_file(self, *, project_id, path):
        return next(
            (record for record in self.records if record.project_id == project_id and record.path == path),
            None,
        )

    async def upsert_project_file(
        self,
        *,
        project_id,
        path,
        role,
        language,
        contents,
        actor_user_id,
        is_deleted=False,
    ):
        record = await self.get_project_file(project_id=project_id, path=path)
        if record is None:
            record = _SourceRecord(
                project_id=project_id,
                path=path,
                role=role,
                language=language,
                contents=contents,
                is_deleted=is_deleted,
            )
            self.records.append(record)
            return record
        record.role = role
        record.language = language
        record.contents = contents
        record.is_deleted = is_deleted
        return record

    async def delete_project_file(self, *, project_id, path):
        before = len(self.records)
        self.records = [record for record in self.records if record.project_id != project_id or record.path != path]
        return before - len(self.records)


def _source_service(
    *,
    project: ProjectRecord,
    settings_value: dict,
    source_repo: _FakeSourceRepository | None = None,
) -> ProjectSourceService:
    runtime_service = _FakeRuntimeService(project=project)
    return ProjectSourceService(
        cast(Settings, object()),
        repo=cast(ProjectRepository, _FakeProjectRepository(project)),
        settings_service=cast(ProjectSettingsService, _FakeSettingsService(settings_value)),
        source_repo=cast(ProjectSourceRepository, source_repo or _FakeSourceRepository()),
        runtime_service=cast(ProjectRuntimeService, runtime_service),
        domain_service=cast(DomainBindingService, _FakeDomainService(project=project, runtime_service=runtime_service)),
    )


@pytest.mark.asyncio
async def test_project_source_service_generates_react_vite_manifest() -> None:
    project = _project()
    repo = _FakeProjectRepository(project)
    settings_service = _FakeSettingsService({
        "project_source": {
            "framework": "react_vite",
            "source_provider": "managed",
            "package_manager": "pnpm",
            "root_directory": ".",
            "build_command": "pnpm build",
            "output_directory": "dist",
            "artifact_strategy": "object_storage",
        },
        "site": {
            "description": "Enterprise launch pages for ACME.",
            "favicon_url": "https://cdn.example.com/favicon.ico",
            "logo_url": "https://cdn.example.com/logo.svg",
            "name": "ACME Launch",
            "url": "https://legacy.example.com",
        },
        "seo": {
            "default_title": "ACME Growth",
            "default_description": "ACME launch SEO fallback.",
            "og_image_url": "https://cdn.example.com/social.jpg",
            "robots_directive": "index,follow",
            "sitemap_enabled": True,
            "title_policy_v1": {
                "parts": [
                    {"kind": "token", "value": "pageTitle"},
                    {"kind": "literal", "value": " - "},
                    {"kind": "token", "value": "siteName"},
                ],
                "home_mode": "siteOnly",
                "dedupe": True,
            },
        },
        "analytics": {
            "google_analytics": {
                "enabled": True,
                "measurement_id": "G-ABC12345",
            }
        },
    })
    runtime_service = _FakeRuntimeService(project=project)
    domain_service = _FakeDomainService(project=project, runtime_service=runtime_service)
    service = ProjectSourceService(
        cast(Settings, object()),
        repo=cast(ProjectRepository, repo),
        settings_service=cast(ProjectSettingsService, settings_service),
        source_repo=cast(ProjectSourceRepository, _FakeSourceRepository()),
        runtime_service=cast(ProjectRuntimeService, runtime_service),
        domain_service=cast(DomainBindingService, domain_service),
    )

    manifest = await service.get_source_manifest(project_id=project.id)

    assert manifest.project_id == project.id
    assert manifest.source_kind == "generated_scaffold"
    assert manifest.framework == "react_vite"
    assert manifest.source_provider == "managed"
    assert manifest.package_manager == "pnpm"
    assert manifest.build_command == "pnpm build"
    assert manifest.output_directory == "dist"
    files = {item.path: item for item in manifest.files}
    assert ".env.example" in files
    assert ".gitignore" in files
    assert "README.md" in files
    assert "package.json" in files
    assert "vite.config.ts" in files
    assert "tsconfig.app.json" in files
    assert "tsconfig.node.json" in files
    assert "src/vite-env.d.ts" in files
    assert "src/App.tsx" in files
    assert "src/arclayer/site-config.ts" in files
    assert '"devDependencies"' in files["package.json"].contents
    assert '"@vitejs/plugin-react": "latest"' in files["package.json"].contents
    assert '"@types/react": "latest"' in files["package.json"].contents
    assert "@arclayer/delivery-sdk" not in files["package.json"].contents
    assert files["src/arclayer/runtime.ts"].role == "runtime"
    assert files["src/arclayer/site-config.ts"].role == "config"
    assert files["src/arclayer/content.ts"].role == "content"
    assert "readContent" in files["src/arclayer/content.ts"].contents
    assert files[".env.example"].contents == (
        "# Override this when running the generated project outside Arclayer.\n"
        "VITE_ARCLAYER_DELIVERY_URL=/content-api/v1\n"
    )
    assert "standalone React + Vite source tree" in files["README.md"].contents
    assert "`src/arclayer/runtime.ts`" in files["README.md"].contents
    assert "VITE_ARCLAYER_DELIVERY_URL" in files["src/arclayer/content.ts"].contents
    assert "@arclayer/delivery-sdk" not in files["src/arclayer/content.ts"].contents
    assert "getProjectSiteConfig" in files["src/App.tsx"].contents
    assert "readContent<ApiEnvelope<DeliveryPageResolve>>" in files["src/App.tsx"].contents
    assert "/delivery/pages/resolve" in files["src/App.tsx"].contents
    assert "heroHeadline" in files["src/App.tsx"].contents
    assert "function syncWebsiteMetadata" in files["src/App.tsx"].contents
    assert "document.title = title" in files["src/App.tsx"].contents
    assert 'upsertNamedMeta("robots", config.seo.robotsDirective)' in files["src/App.tsx"].contents
    assert 'upsertPropertyMeta("og:image", config.seo.socialImageUrl)' in files["src/App.tsx"].contents
    assert 'upsertLink("canonical", canonicalUrl)' in files["src/App.tsx"].contents
    assert 'upsertLink("icon", config.site.faviconUrl)' in files["src/App.tsx"].contents
    assert "Published content is connected to the Home page item." in files["src/App.tsx"].contents
    assert "ACME Launch" in files["src/arclayer/site-config.ts"].contents
    assert "https://launch-site.arclayer.localhost" in files["src/arclayer/site-config.ts"].contents
    assert "https://legacy.example.com" not in files["src/arclayer/site-config.ts"].contents
    assert "https://cdn.example.com/social.jpg" in files["src/arclayer/site-config.ts"].contents
    assert '"robotsDirective": "index,follow"' in files["src/arclayer/site-config.ts"].contents
    assert '"sitemapEnabled": true' in files["src/arclayer/site-config.ts"].contents
    assert "G-ABC12345" in files["src/arclayer/site-config.ts"].contents
    assert f'"runtimeId": "{runtime_service.runtime_id}"' in files["src/arclayer/runtime.ts"].contents
    assert f'"siteId": "{runtime_service.site_id}"' in files["src/arclayer/runtime.ts"].contents
    assert f'"workspaceId": "{project.workspace_id}"' in files["src/arclayer/runtime.ts"].contents
    assert '"primaryDomain": "launch-site.arclayer.localhost"' in files["src/arclayer/runtime.ts"].contents
    assert '"primaryUrl": "https://launch-site.arclayer.localhost"' in files["src/arclayer/runtime.ts"].contents
    assert repo.project_ids == [project.id]
    assert settings_service.project_ids == [project.id]
    assert runtime_service.project_ids == [project.id]
    assert domain_service.project_ids == [project.id]


@pytest.mark.asyncio
async def test_project_source_service_merges_managed_source_overlay() -> None:
    project = _project()
    source_repo = _FakeSourceRepository([
        _SourceRecord(
            project_id=project.id,
            path="src/App.tsx",
            role="entry",
            language="typescriptreact",
            contents="export function App() { return <main>Managed</main>; }\n",
        ),
        _SourceRecord(
            project_id=project.id,
            path="src/legacy.css",
            role="style",
            language="css",
            contents="",
            is_deleted=True,
        ),
        _SourceRecord(
            project_id=project.id,
            path="src/components/Hero.tsx",
            role="source",
            language="typescriptreact",
            contents="export function Hero() { return null; }\n",
        ),
    ])
    service = _source_service(project=project, settings_value={"project_source": {}}, source_repo=source_repo)

    manifest = await service.get_source_manifest(project_id=project.id)

    assert manifest.source_kind == "managed_source"
    files = {item.path: item for item in manifest.files}
    assert files["src/App.tsx"].contents == "export function App() { return <main>Managed</main>; }\n"
    assert files["src/components/Hero.tsx"].role == "source"
    assert "src/legacy.css" not in files


@pytest.mark.asyncio
async def test_project_source_service_reads_scaffold_and_managed_source_files() -> None:
    project = _project()
    source_repo = _FakeSourceRepository([
        _SourceRecord(
            project_id=project.id,
            path="src/App.tsx",
            role="entry",
            language="typescriptreact",
            contents="export function App() { return <main>Managed</main>; }\n",
        ),
    ])
    service = _source_service(project=project, settings_value={"project_source": {}}, source_repo=source_repo)

    managed_file = await service.get_source_file(project_id=project.id, path="src/App.tsx")
    scaffold_file = await service.get_source_file(project_id=project.id, path="./src/arclayer/site-config.ts")

    assert managed_file.contents == "export function App() { return <main>Managed</main>; }\n"
    assert managed_file.role == "entry"
    assert scaffold_file.path == "src/arclayer/site-config.ts"
    assert scaffold_file.role == "config"
    assert "getProjectSiteConfig" in scaffold_file.contents


@pytest.mark.asyncio
async def test_project_source_service_rejects_read_for_deleted_or_unknown_file() -> None:
    project = _project()
    source_repo = _FakeSourceRepository([
        _SourceRecord(
            project_id=project.id,
            path="src/App.tsx",
            role="entry",
            language="typescriptreact",
            contents="",
            is_deleted=True,
        ),
    ])
    service = _source_service(project=project, settings_value={"project_source": {}}, source_repo=source_repo)

    with pytest.raises(NotFound) as deleted_exc:
        await service.get_source_file(project_id=project.id, path="src/App.tsx")

    with pytest.raises(NotFound) as missing_exc:
        await service.get_source_file(project_id=project.id, path="src/missing.ts")

    assert deleted_exc.value.error == "PROJECT_SOURCE_FILE_NOT_FOUND"
    assert missing_exc.value.error == "PROJECT_SOURCE_FILE_NOT_FOUND"


@pytest.mark.asyncio
async def test_project_source_service_generates_astro_manifest() -> None:
    project = _project()
    service = _source_service(
        project=project,
        settings_value={
            "project_source": {
                "framework": "astro",
                "source_provider": "git",
                "package_manager": "npm",
                "root_directory": "sites/marketing",
                "build_command": "npm run build",
                "output_directory": "dist",
                "artifact_strategy": "container_image",
            }
        },
    )

    manifest = await service.get_source_manifest(project_id=project.id)

    assert manifest.framework == "astro"
    assert manifest.source_provider == "git"
    assert manifest.package_manager == "npm"
    assert manifest.root_directory == "sites/marketing"
    assert manifest.artifact_strategy == "container_image"
    files = {item.path: item for item in manifest.files}
    assert ".env.example" in files
    assert ".gitignore" in files
    assert "README.md" in files
    assert "astro.config.mjs" in files
    assert "src/pages/index.astro" in files
    assert "src/arclayer/content.ts" in files
    assert "src/arclayer/site-config.ts" in files
    package_json = loads(files["package.json"].contents)
    assert package_json["scripts"]["build"] == "astro check && astro build"
    assert package_json["scripts"]["typecheck"] == "astro check"
    assert package_json["dependencies"]["react"] == "latest"
    assert package_json["dependencies"]["react-dom"] == "latest"
    assert package_json["devDependencies"]["@astrojs/check"] == "latest"
    assert package_json["devDependencies"]["@astrojs/react"] == "latest"
    assert package_json["devDependencies"]["@types/react"] == "latest"
    assert package_json["devDependencies"]["@types/react-dom"] == "latest"
    assert "@arclayer/delivery-sdk" not in files["package.json"].contents
    assert "PUBLIC_ARCLAYER_DELIVERY_URL=/content-api/v1" in files[".env.example"].contents
    assert "standalone Astro + React islands source tree" in files["README.md"].contents
    assert "PUBLIC_ARCLAYER_DELIVERY_URL" in files["src/arclayer/content.ts"].contents
    assert "@arclayer/delivery-sdk" not in files["src/arclayer/content.ts"].contents
    assert "getProjectSiteConfig" in files["src/pages/index.astro"].contents
    assert "client:load" in files["src/pages/index.astro"].contents
    assert "readContent<ApiEnvelope<DeliveryPageResolve>>" in files["src/components/ReactIsland.tsx"].contents
    assert "/delivery/pages/resolve" in files["src/components/ReactIsland.tsx"].contents
    assert "heroHeadline" in files["src/components/ReactIsland.tsx"].contents
    assert "Published content is connected to the Home page item." in files["src/components/ReactIsland.tsx"].contents
    assert '"runtimeId":' in files["src/arclayer/runtime.ts"].contents
    assert '"primaryDomain": "launch-site.arclayer.localhost"' in files["src/arclayer/runtime.ts"].contents


@pytest.mark.asyncio
async def test_project_source_service_rejects_unsafe_source_paths() -> None:
    project = _project()
    service = _source_service(project=project, settings_value={"project_source": {"root_directory": "../outside"}})

    with pytest.raises(Conflict) as exc:
        await service.get_source_manifest(project_id=project.id)

    assert exc.value.error == "PROJECT_SOURCE_PATH_UNSAFE"


@pytest.mark.asyncio
async def test_project_source_service_upserts_managed_source_file() -> None:
    project = _project()
    source_repo = _FakeSourceRepository()
    service = _source_service(project=project, settings_value={"project_source": {}}, source_repo=source_repo)

    file = await service.upsert_source_file(
        project_id=project.id,
        path="./src/components/Hero.tsx",
        payload=ProjectSourceFileUpsertIn(contents="export function Hero() { return null; }\n"),
        actor_user_id=uuid4(),
    )

    assert file.path == "src/components/Hero.tsx"
    assert file.role == "source"
    assert file.language == "typescriptreact"
    assert source_repo.records[0].contents == "export function Hero() { return null; }\n"


@pytest.mark.asyncio
async def test_project_source_service_infers_site_config_writes_as_config_files() -> None:
    project = _project()
    source_repo = _FakeSourceRepository()
    service = _source_service(project=project, settings_value={"project_source": {}}, source_repo=source_repo)

    file = await service.upsert_source_file(
        project_id=project.id,
        path="src/arclayer/site-config.generated.ts",
        payload=ProjectSourceFileUpsertIn(contents="export const projectSiteConfig = {};\n"),
        actor_user_id=uuid4(),
    )

    assert file.path == "src/arclayer/site-config.generated.ts"
    assert file.role == "config"
    assert file.language == "typescript"


@pytest.mark.asyncio
async def test_project_source_service_rejects_source_write_for_git_provider() -> None:
    project = _project()
    service = _source_service(project=project, settings_value={"project_source": {"source_provider": "git"}})

    with pytest.raises(Conflict) as exc:
        await service.upsert_source_file(
            project_id=project.id,
            path="src/App.tsx",
            payload=ProjectSourceFileUpsertIn(contents=""),
            actor_user_id=uuid4(),
        )

    assert exc.value.error == "PROJECT_SOURCE_PROVIDER_READ_ONLY"


@pytest.mark.asyncio
async def test_project_source_service_deletes_scaffold_file_with_tombstone() -> None:
    project = _project()
    source_repo = _FakeSourceRepository()
    service = _source_service(project=project, settings_value={"project_source": {}}, source_repo=source_repo)

    result = await service.delete_source_file(project_id=project.id, path="src/App.tsx", actor_user_id=uuid4())
    manifest = await service.get_source_manifest(project_id=project.id)

    assert result.deleted is True
    assert result.path == "src/App.tsx"
    assert "src/App.tsx" not in {file.path for file in manifest.files}
    assert source_repo.records[0].is_deleted is True


@pytest.mark.asyncio
async def test_project_source_service_rejects_unsafe_file_write_path() -> None:
    project = _project()
    service = _source_service(project=project, settings_value={"project_source": {}})

    with pytest.raises(BadRequest) as exc:
        await service.upsert_source_file(
            project_id=project.id,
            path="../outside.ts",
            payload=ProjectSourceFileUpsertIn(contents=""),
            actor_user_id=uuid4(),
        )

    assert exc.value.error == "PROJECT_SOURCE_FILE_PATH_UNSAFE"


@pytest.mark.asyncio
async def test_project_source_service_rejects_delete_for_unknown_file() -> None:
    project = _project()
    service = _source_service(project=project, settings_value={"project_source": {}})

    with pytest.raises(NotFound) as exc:
        await service.delete_source_file(project_id=project.id, path="missing.ts", actor_user_id=uuid4())

    assert exc.value.error == "PROJECT_SOURCE_FILE_NOT_FOUND"
