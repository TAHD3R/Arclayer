from __future__ import annotations

from collections.abc import Sequence
from json import dumps
from typing import Any, Protocol, cast
from uuid import UUID

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services.base import BaseService
from src.models.projects.project import ProjectRecord
from src.modules.domains.schema import DomainBindingOut, resolve_routable_domain_binding
from src.modules.domains.service import DomainBindingService
from src.modules.projects.repository import ProjectRepository
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.modules.projects.settings.service import ProjectSettingsService
from src.modules.projects.source.repository import ProjectSourceRepository
from src.modules.projects.source.schema import (
    ProjectSourceArtifactStrategy,
    ProjectSourceFileDeleteOut,
    ProjectSourceFileOut,
    ProjectSourceFileRole,
    ProjectSourceFileUpsertIn,
    ProjectSourceFramework,
    ProjectSourceKind,
    ProjectSourceManifestOut,
    ProjectSourcePackageManager,
    ProjectSourceProvider,
)


class ProjectSourceConfig(BaseSchema):
    model_config = ConfigDict(frozen=True)

    framework: ProjectSourceFramework = "react_vite"
    source_provider: ProjectSourceProvider = "managed"
    package_manager: ProjectSourcePackageManager = "pnpm"
    root_directory: str = "."
    build_command: str = "pnpm build"
    output_directory: str = "dist"
    artifact_strategy: ProjectSourceArtifactStrategy = "object_storage"


_FRAMEWORKS = frozenset({"react_vite", "astro"})
_SOURCE_PROVIDERS = frozenset({"managed", "git"})
_PACKAGE_MANAGERS = frozenset({"pnpm", "npm"})
_ARTIFACT_STRATEGIES = frozenset({"object_storage", "container_image"})
_CONFIG_FILE_NAMES = frozenset({
    "astro.config.mjs",
    ".env.example",
    ".gitignore",
    "index.html",
    "package.json",
    "README.md",
    "tsconfig.app.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
})
_LANGUAGE_BY_EXTENSION = {
    ".env.example": "dotenv",
    ".gitignore": "ignore",
    ".astro": "astro",
    ".css": "css",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescriptreact",
}


class ProjectSourceFileRecordLike(Protocol):
    path: str
    role: str
    language: str
    contents: str
    is_deleted: bool


def _read_project_source_section(value: dict[str, Any]) -> dict[str, Any]:
    section = value.get("project_source")
    if section is None:
        return {}
    if isinstance(section, dict):
        return section
    raise Conflict(message=t("errors", "PROJECT_SOURCE_SETTINGS_INVALID"), error="PROJECT_SOURCE_SETTINGS_INVALID")


def _read_choice(
    section: dict[str, Any],
    key: str,
    *,
    default: str,
    allowed: frozenset[str],
) -> str:
    value = section.get(key, default)
    if isinstance(value, str) and value in allowed:
        return value
    raise Conflict(
        message=t("errors", "PROJECT_SOURCE_SETTINGS_INVALID"),
        error="PROJECT_SOURCE_SETTINGS_INVALID",
        meta={"field": key, "value": value},
    )


def _read_path(section: dict[str, Any], key: str, *, default: str) -> str:
    value = section.get(key, default)
    if not isinstance(value, str) or not value.strip():
        raise Conflict(
            message=t("errors", "PROJECT_SOURCE_SETTINGS_INVALID"),
            error="PROJECT_SOURCE_SETTINGS_INVALID",
            meta={"field": key, "value": value},
        )
    normalized = value.strip()
    if normalized.startswith("/") or ".." in normalized.replace("\\", "/").split("/"):
        raise Conflict(
            message=t("errors", "PROJECT_SOURCE_PATH_UNSAFE"),
            error="PROJECT_SOURCE_PATH_UNSAFE",
            meta={"field": key, "value": value},
        )
    return normalized


def _normalize_source_file_path(value: str) -> str:
    raw = value.strip().replace("\\", "/")
    if not raw or raw.startswith("/") or raw.endswith("/"):
        raise BadRequest(
            message=t("errors", "PROJECT_SOURCE_FILE_PATH_INVALID"),
            error="PROJECT_SOURCE_FILE_PATH_INVALID",
            meta={"path": value},
        )
    parts = [part for part in raw.split("/") if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        raise BadRequest(
            message=t("errors", "PROJECT_SOURCE_FILE_PATH_UNSAFE"),
            error="PROJECT_SOURCE_FILE_PATH_UNSAFE",
            meta={"path": value},
        )
    return "/".join(parts)


def _read_command(section: dict[str, Any], key: str, *, default: str) -> str:
    value = section.get(key, default)
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise Conflict(
        message=t("errors", "PROJECT_SOURCE_SETTINGS_INVALID"),
        error="PROJECT_SOURCE_SETTINGS_INVALID",
        meta={"field": key, "value": value},
    )


def _source_config_from_settings(value: dict[str, Any]) -> ProjectSourceConfig:
    section = _read_project_source_section(value)
    return ProjectSourceConfig(
        framework=cast(
            ProjectSourceFramework,
            _read_choice(section, "framework", default="react_vite", allowed=_FRAMEWORKS),
        ),
        source_provider=cast(
            ProjectSourceProvider,
            _read_choice(section, "source_provider", default="managed", allowed=_SOURCE_PROVIDERS),
        ),
        package_manager=cast(
            ProjectSourcePackageManager,
            _read_choice(section, "package_manager", default="pnpm", allowed=_PACKAGE_MANAGERS),
        ),
        root_directory=_read_path(section, "root_directory", default="."),
        build_command=_read_command(section, "build_command", default="pnpm build"),
        output_directory=_read_path(section, "output_directory", default="dist"),
        artifact_strategy=cast(
            ProjectSourceArtifactStrategy,
            _read_choice(
                section,
                "artifact_strategy",
                default="object_storage",
                allowed=_ARTIFACT_STRATEGIES,
            ),
        ),
    )


def _project_package_name(project: ProjectRecord) -> str:
    return f"arclayer-project-{project.slug}".lower()


def _nested_dict(value: dict[str, Any], path: Sequence[str]) -> dict[str, Any]:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return {}
        current = current.get(key)
    return current if isinstance(current, dict) else {}


def _nested_str(value: dict[str, Any], path: Sequence[str]) -> str | None:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current if isinstance(current, str) and current.strip() else None


def _nested_bool(value: dict[str, Any], path: Sequence[str]) -> bool | None:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current if isinstance(current, bool) else None


def _site_config_payload(
    project: ProjectRecord,
    settings_value: dict[str, Any],
    *,
    public_url: str | None,
) -> dict[str, Any]:
    site = _nested_dict(settings_value, ["site"])
    seo = _nested_dict(settings_value, ["seo"])
    analytics = _nested_dict(settings_value, ["analytics", "google_analytics"])
    measurement_id = _nested_str(analytics, ["measurement_id"]) or _nested_str(
        seo,
        ["google_analytics_measurement_id"],
    )
    analytics_enabled = _nested_bool(analytics, ["enabled"])
    description = (
        _nested_str(site, ["description"])
        or _nested_str(seo, ["default_description"])
        or project.description
        or "A new Arclayer site."
    )
    return {
        "project": {
            "id": str(project.id),
            "slug": project.slug,
            "name": project.name,
            "description": project.description,
        },
        "site": {
            "name": _nested_str(site, ["name"]) or project.name,
            "subtitle": _nested_str(site, ["subtitle"]),
            "description": description,
            "url": public_url,
            "logoUrl": _nested_str(site, ["logo_url"]),
            "logoAssetId": _nested_str(site, ["logo_asset_id"]),
            "faviconUrl": _nested_str(site, ["favicon_url"]),
            "faviconAssetId": _nested_str(site, ["favicon_asset_id"]),
            "contactEmail": _nested_str(site, ["contact_email"]),
        },
        "seo": {
            "defaultTitle": _nested_str(seo, ["default_title"]),
            "defaultDescription": _nested_str(seo, ["default_description"]) or description,
            "socialImageUrl": _nested_str(seo, ["og_image_url"]),
            "socialImageAssetId": _nested_str(seo, ["og_image_asset_id"]),
            "titlePolicy": seo.get("title_policy_v1"),
            "robotsDirective": _nested_str(seo, ["robots_directive"]) or "index,follow",
            "sitemapEnabled": _nested_bool(seo, ["sitemap_enabled"]) is not False,
        },
        "analytics": {
            "googleAnalytics": {
                "enabled": analytics_enabled if analytics_enabled is not None else bool(measurement_id),
                "measurementId": measurement_id,
            }
        },
    }


def _site_config_ts(
    project: ProjectRecord,
    settings_value: dict[str, Any],
    *,
    public_url: str | None,
) -> str:
    payload = dumps(
        _site_config_payload(project, settings_value, public_url=public_url),
        indent=2,
        sort_keys=False,
    )
    return (
        f"const projectSiteConfig = {payload} as const;\n\n"
        "export type ProjectSiteConfig = typeof projectSiteConfig;\n\n"
        "export function getProjectSiteConfig(): ProjectSiteConfig {\n"
        "  return projectSiteConfig;\n"
        "}\n"
    )


def _runtime_config_payload(
    *,
    project: ProjectRecord,
    runtime_context: Any,
    domains: Sequence[DomainBindingOut],
) -> dict[str, Any]:
    primary_domain = resolve_routable_domain_binding(domains, site_id=runtime_context.site_id)
    primary_hostname = primary_domain.hostname if primary_domain is not None else None
    return {
        "projectId": str(project.id),
        "projectSlug": project.slug,
        "workspaceId": str(runtime_context.workspace_id),
        "runtimeId": str(runtime_context.runtime_id),
        "runtimeName": runtime_context.name,
        "runtimeKind": runtime_context.kind,
        "runtimeSlug": runtime_context.slug,
        "siteId": str(runtime_context.site_id),
        "defaultLocale": runtime_context.default_locale,
        "fallbackLocale": runtime_context.fallback_locale,
        "isActive": runtime_context.is_active,
        "primaryDomain": primary_hostname,
        "primaryUrl": f"https://{primary_hostname}" if primary_hostname is not None else None,
    }


def _runtime_config_ts(payload: dict[str, Any]) -> str:
    value = dumps(payload, indent=2, sort_keys=False)
    return (
        f"const projectRuntimeConfig = {value} as const;\n\n"
        "export type ProjectRuntimeConfig = typeof projectRuntimeConfig;\n\n"
        "export function getProjectRuntimeConfig(): ProjectRuntimeConfig {\n"
        "  return projectRuntimeConfig;\n"
        "}\n"
    )


def _package_json(project: ProjectRecord, *, framework: ProjectSourceFramework) -> str:
    scripts = {
        "dev": "vite --host 0.0.0.0" if framework == "react_vite" else "astro dev --host 0.0.0.0",
        "build": "vite build" if framework == "react_vite" else "astro check && astro build",
        "preview": "vite preview --host 0.0.0.0" if framework == "react_vite" else "astro preview --host 0.0.0.0",
        "typecheck": "tsc --noEmit" if framework == "react_vite" else "astro check",
    }
    dependencies: dict[str, str] = {}
    dev_dependencies = {"typescript": "latest"}
    if framework == "react_vite":
        dependencies.update({"react": "latest", "react-dom": "latest"})
        dev_dependencies.update({
            "@types/react": "latest",
            "@types/react-dom": "latest",
            "@vitejs/plugin-react": "latest",
            "vite": "latest",
        })
    else:
        dependencies.update({"react": "latest", "react-dom": "latest"})
        dev_dependencies.update({
            "@astrojs/check": "latest",
            "@astrojs/react": "latest",
            "@types/react": "latest",
            "@types/react-dom": "latest",
            "astro": "latest",
        })
    return (
        dumps(
            {
                "name": _project_package_name(project),
                "private": True,
                "type": "module",
                "scripts": scripts,
                "dependencies": dependencies,
                "devDependencies": dev_dependencies,
            },
            indent=2,
            sort_keys=False,
        )
        + "\n"
    )


def _gitignore() -> str:
    return "node_modules\ndist\n.env\n.env.local\n.DS_Store\n"


def _env_example(*, env_key: str) -> str:
    return f"# Override this when running the generated project outside Arclayer.\n{env_key}=/content-api/v1\n"


def _project_readme_md(*, framework: ProjectSourceFramework, env_key: str) -> str:
    framework_label = "React + Vite" if framework == "react_vite" else "Astro + React islands"
    return (
        "# Arclayer Managed Site\n\n"
        f"This project is a standalone {framework_label} source tree generated by Arclayer.\n\n"
        "## Managed files\n\n"
        "- `src/arclayer/runtime.ts` contains the project, workspace, runtime, site, and primary domain identifiers.\n"
        "- `src/arclayer/site-config.ts` contains website identity, SEO defaults, and Google Analytics settings.\n"
        "- `src/arclayer/content.ts` reads published site content from the Arclayer delivery API.\n\n"
        "## Local development\n\n"
        "```bash\n"
        "pnpm install\n"
        "pnpm dev\n"
        "```\n\n"
        "Copy `.env.example` to `.env.local` if the project is developed outside the Arclayer preview domain.\n\n"
        "## Environment\n\n"
        f"- `{env_key}` points the generated content client at the delivery API. The default value uses the same origin.\n\n"
        "## Build\n\n"
        "```bash\n"
        "pnpm build\n"
        "```\n"
    )


def _react_tsconfig_json() -> str:
    return (
        dumps(
            {"files": [], "references": [{"path": "./tsconfig.app.json"}, {"path": "./tsconfig.node.json"}]}, indent=2
        )
        + "\n"
    )


def _react_tsconfig_app_json() -> str:
    return (
        dumps(
            {
                "compilerOptions": {
                    "target": "ES2022",
                    "useDefineForClassFields": True,
                    "lib": ["ES2022", "DOM", "DOM.Iterable"],
                    "allowJs": False,
                    "skipLibCheck": True,
                    "esModuleInterop": True,
                    "allowSyntheticDefaultImports": True,
                    "strict": True,
                    "forceConsistentCasingInFileNames": True,
                    "module": "ESNext",
                    "moduleResolution": "Bundler",
                    "resolveJsonModule": True,
                    "isolatedModules": True,
                    "noEmit": True,
                    "jsx": "react-jsx",
                },
                "include": ["src"],
            },
            indent=2,
        )
        + "\n"
    )


def _react_tsconfig_node_json() -> str:
    return (
        dumps(
            {
                "compilerOptions": {
                    "composite": True,
                    "skipLibCheck": True,
                    "module": "ESNext",
                    "moduleResolution": "Bundler",
                    "allowSyntheticDefaultImports": True,
                    "strict": True,
                },
                "include": ["vite.config.ts"],
            },
            indent=2,
        )
        + "\n"
    )


def _content_client_ts(*, env_key: str) -> str:
    return (
        "export type ContentQuery = Record<string, string | number | boolean | null | undefined>;\n\n"
        "export interface ContentRequestOptions {\n"
        "  query?: ContentQuery;\n"
        "}\n\n"
        "const deliveryBaseUrl = "
        f'import.meta.env.{env_key} ?? "/content-api/v1";\n\n'
        "function buildContentUrl(path: string, query: ContentQuery = {}): string {\n"
        '  const normalizedPath = path.startsWith("/") ? path : `/${path}`;\n'
        "  const url = new URL(`${deliveryBaseUrl}${normalizedPath}`, window.location.origin);\n"
        "  Object.entries(query).forEach(([key, value]) => {\n"
        "    if (value !== null && value !== undefined) {\n"
        "      url.searchParams.set(key, String(value));\n"
        "    }\n"
        "  });\n"
        "  return url.toString();\n"
        "}\n\n"
        "export async function readContent<T>(path: string, options: ContentRequestOptions = {}): Promise<T> {\n"
        "  const response = await fetch(buildContentUrl(path, options.query), {\n"
        '    headers: { Accept: "application/json" },\n'
        "  });\n"
        "  if (!response.ok) {\n"
        "    throw new Error(`Content request failed: ${response.status} ${response.statusText}`);\n"
        "  }\n"
        "  return (await response.json()) as T;\n"
        "}\n"
    )


def _home_page_react_component_tsx(
    *,
    content_import_path: str,
    runtime_import_path: str,
    site_config_import_path: str,
    export_declaration: str,
) -> str:
    return (
        """import { useEffect, useMemo, useState } from "react";

import { readContent } from "__CONTENT_IMPORT_PATH__";
import { getProjectRuntimeConfig } from "__RUNTIME_IMPORT_PATH__";
import { getProjectSiteConfig } from "__SITE_CONFIG_IMPORT_PATH__";

type ApiEnvelope<T> = {
  data?: T | null;
};

type HomeSection = {
  key?: string;
  title?: string;
  body?: string;
};

type HomePageFields = {
  title?: string;
  path?: string;
  heroHeadline?: string;
  heroSubheading?: string;
  primaryCtaLabel?: string;
  canonicalUrl?: string | null;
  sections?: HomeSection[];
};

type DeliveryPageResolve = {
  context?: {
    primary?: {
      data?: HomePageFields;
      title?: string | null;
    } | null;
  } | null;
};

type ContentState = {
  error: string | null;
  page: HomePageFields | null;
  status: "error" | "loading" | "ready";
};

function normalizeSections(value: HomePageFields["sections"]): HomeSection[] {
  return Array.isArray(value) ? value : [];
}

function upsertNamedMeta(name: string, content: string | null | undefined): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertPropertyMeta(property: string, content: string | null | undefined): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertLink(rel: string, href: string | null | undefined): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

function syncWebsiteMetadata(config: ReturnType<typeof getProjectSiteConfig>, page: HomePageFields | null): void {
  const title = page?.title ?? config.seo.defaultTitle ?? config.site.name;
  const description = config.seo.defaultDescription ?? config.site.description;
  const canonicalUrl = page?.canonicalUrl ?? config.site.url;
  document.title = title;
  upsertNamedMeta("description", description);
  upsertNamedMeta("robots", config.seo.robotsDirective);
  upsertPropertyMeta("og:title", title);
  upsertPropertyMeta("og:description", description);
  upsertPropertyMeta("og:type", "website");
  upsertPropertyMeta("og:url", canonicalUrl);
  upsertPropertyMeta("og:image", config.seo.socialImageUrl);
  upsertLink("canonical", canonicalUrl);
  upsertLink("icon", config.site.faviconUrl);
}

__EXPORT_DECLARATION__ {
  const runtime = getProjectRuntimeConfig();
  const config = getProjectSiteConfig();
  const runtimeId = runtime.runtimeId;
  const [content, setContent] = useState<ContentState>({
    error: runtimeId ? null : "Runtime id is required before delivery content can be resolved.",
    page: null,
    status: runtimeId ? "loading" : "error",
  });

  useEffect(() => {
    if (!runtimeId) return;
    let active = true;
    readContent<ApiEnvelope<DeliveryPageResolve>>(`/runtimes/${runtimeId}/delivery/pages/resolve`, {
      query: { path: "/", perspective: "published" },
    })
      .then((response) => {
        if (!active) return;
        const page = response.data?.context?.primary?.data ?? null;
        setContent({
          error: page ? null : "Delivery resolved the route, but no primary page content was returned.",
          page,
          status: page ? "ready" : "error",
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setContent({
          error: error instanceof Error ? error.message : "Delivery content request failed.",
          page: null,
          status: "error",
        });
      });
    return () => {
      active = false;
    };
  }, [runtimeId]);

  const page = content.page;
  useEffect(() => {
    syncWebsiteMetadata(config, page);
  }, [config, page]);
  const sections = useMemo(() => normalizeSections(page?.sections), [page]);
  const heroHeadline = page?.heroHeadline ?? page?.title ?? config.site.name;
  const heroSubheading = page?.heroSubheading ?? config.site.description;
  const ctaHref = page?.canonicalUrl ?? config.site.url ?? "#content";
  const ctaLabel = page?.primaryCtaLabel ?? "Explore the site";

  return (
    <main className="site-shell">
      <section className="hero">
        <p className="eyebrow">Arclayer managed site</p>
        <h1>{heroHeadline}</h1>
        <p className="lede">{heroSubheading}</p>
        <div className="actions">
          <a href={ctaHref}>{ctaLabel}</a>
          <a href="#content" className="secondary">View content</a>
        </div>
      </section>
      <section id="content" className="proof-grid" aria-label="Homepage sections">
        {sections.length > 0 ? (
          sections.map((section, index) => (
            <article key={section.key ?? `${section.title ?? "section"}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{section.title ?? "Untitled section"}</h2>
              <p>{section.body ?? "No section body has been written yet."}</p>
            </article>
          ))
        ) : (
          <article>
            <span>01</span>
            <h2>Content model connected</h2>
            <p>Create or publish homepage sections in Arclayer to render them here.</p>
          </article>
        )}
      </section>
      <aside className={`content-status ${content.status}`}>
        <strong>Content delivery</strong>
        <span>
          {content.status === "loading"
            ? "Loading published content from Arclayer delivery..."
            : content.status === "ready"
              ? "Published content is connected to the Home page item."
              : content.error}
        </span>
      </aside>
      <aside className="brief">
        <strong>Runtime</strong>
        <span>{runtime.primaryUrl ?? "No primary domain has been connected yet."}</span>
        <small>Project {runtime.projectSlug} renders managed content from runtime {runtimeId ?? "pending"}.</small>
      </aside>
    </main>
  );
}
"""
        .replace(
            "__CONTENT_IMPORT_PATH__",
            content_import_path,
        )
        .replace(
            "__RUNTIME_IMPORT_PATH__",
            runtime_import_path,
        )
        .replace(
            "__SITE_CONFIG_IMPORT_PATH__",
            site_config_import_path,
        )
        .replace("__EXPORT_DECLARATION__", export_declaration)
    )


def _react_app_tsx() -> str:
    return _home_page_react_component_tsx(
        content_import_path="./arclayer/content",
        runtime_import_path="./arclayer/runtime",
        site_config_import_path="./arclayer/site-config",
        export_declaration="export function App()",
    )


def _astro_react_island_tsx() -> str:
    return _home_page_react_component_tsx(
        content_import_path="../arclayer/content",
        runtime_import_path="../arclayer/runtime",
        site_config_import_path="../arclayer/site-config",
        export_declaration="export default function ReactIsland()",
    )


def _react_index_css() -> str:
    return """:root {
  color: #111827;
  background: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

body {
  margin: 0;
}

a {
  color: inherit;
}

.site-shell {
  min-height: 100vh;
  display: grid;
  gap: 1.5rem;
  padding: clamp(2rem, 6vw, 5rem);
}

.hero {
  align-self: end;
  max-width: 880px;
}

.eyebrow {
  color: #475569;
  font-size: 0.78rem;
  font-weight: 700;
  margin: 0 0 1rem;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(3rem, 8vw, 6.5rem);
  line-height: 0.95;
  margin: 0;
  max-width: 13ch;
}

.lede {
  color: #334155;
  font-size: clamp(1.1rem, 2vw, 1.45rem);
  line-height: 1.6;
  max-width: 62ch;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.actions a {
  align-items: center;
  background: #111827;
  border: 1px solid #111827;
  color: #ffffff;
  display: inline-flex;
  font-weight: 700;
  min-height: 2.75rem;
  padding: 0 1rem;
  text-decoration: none;
}

.actions .secondary {
  background: transparent;
  color: #111827;
}

.proof-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
  margin-top: 2rem;
}

.proof-grid article,
.content-status,
.brief {
  background: #ffffff;
  border: 1px solid #dbe3ea;
  padding: 1rem;
}

.proof-grid span,
.brief small {
  color: #64748b;
  font-size: 0.82rem;
}

.proof-grid h2 {
  font-size: 1.1rem;
  margin: 0.5rem 0;
}

.proof-grid p,
.content-status span,
.brief span {
  color: #334155;
  line-height: 1.6;
  margin: 0;
}

.content-status,
.brief {
  display: grid;
  gap: 0.35rem;
}
"""


def _react_vite_files(
    project: ProjectRecord,
    settings_value: dict[str, Any],
    runtime_value: dict[str, Any],
) -> list[ProjectSourceFileOut]:
    return [
        ProjectSourceFileOut(
            path=".env.example",
            role="config",
            language="dotenv",
            contents=_env_example(env_key="VITE_ARCLAYER_DELIVERY_URL"),
        ),
        ProjectSourceFileOut(path=".gitignore", role="config", language="ignore", contents=_gitignore()),
        ProjectSourceFileOut(
            path="README.md",
            role="config",
            language="markdown",
            contents=_project_readme_md(framework="react_vite", env_key="VITE_ARCLAYER_DELIVERY_URL"),
        ),
        ProjectSourceFileOut(
            path="package.json", role="config", language="json", contents=_package_json(project, framework="react_vite")
        ),
        ProjectSourceFileOut(
            path="index.html",
            role="entry",
            language="html",
            contents='<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Arclayer Managed Site</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n',
        ),
        ProjectSourceFileOut(
            path="tsconfig.json",
            role="config",
            language="json",
            contents=_react_tsconfig_json(),
        ),
        ProjectSourceFileOut(
            path="tsconfig.app.json",
            role="config",
            language="json",
            contents=_react_tsconfig_app_json(),
        ),
        ProjectSourceFileOut(
            path="tsconfig.node.json",
            role="config",
            language="json",
            contents=_react_tsconfig_node_json(),
        ),
        ProjectSourceFileOut(
            path="vite.config.ts",
            role="config",
            language="typescript",
            contents='import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({ plugins: [react()] });\n',
        ),
        ProjectSourceFileOut(
            path="src/main.tsx",
            role="entry",
            language="typescriptreact",
            contents='import React from "react";\nimport { createRoot } from "react-dom/client";\n\nimport { App } from "./App";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
        ),
        ProjectSourceFileOut(
            path="src/vite-env.d.ts",
            role="types",
            language="typescript",
            contents='/// <reference types="vite/client" />\n',
        ),
        ProjectSourceFileOut(
            path="src/App.tsx",
            role="entry",
            language="typescriptreact",
            contents=_react_app_tsx(),
        ),
        ProjectSourceFileOut(
            path="src/index.css",
            role="style",
            language="css",
            contents=_react_index_css(),
        ),
        ProjectSourceFileOut(
            path="src/arclayer/runtime.ts",
            role="runtime",
            language="typescript",
            contents=_runtime_config_ts(runtime_value),
        ),
        ProjectSourceFileOut(
            path="src/arclayer/site-config.ts",
            role="config",
            language="typescript",
            contents=_site_config_ts(project, settings_value, public_url=runtime_value.get("primaryUrl")),
        ),
        ProjectSourceFileOut(
            path="src/arclayer/content.ts",
            role="content",
            language="typescript",
            contents=_content_client_ts(env_key="VITE_ARCLAYER_DELIVERY_URL"),
        ),
    ]


def _astro_files(
    project: ProjectRecord,
    settings_value: dict[str, Any],
    runtime_value: dict[str, Any],
) -> list[ProjectSourceFileOut]:
    return [
        ProjectSourceFileOut(
            path=".env.example",
            role="config",
            language="dotenv",
            contents=_env_example(env_key="PUBLIC_ARCLAYER_DELIVERY_URL"),
        ),
        ProjectSourceFileOut(path=".gitignore", role="config", language="ignore", contents=_gitignore()),
        ProjectSourceFileOut(
            path="README.md",
            role="config",
            language="markdown",
            contents=_project_readme_md(framework="astro", env_key="PUBLIC_ARCLAYER_DELIVERY_URL"),
        ),
        ProjectSourceFileOut(
            path="package.json", role="config", language="json", contents=_package_json(project, framework="astro")
        ),
        ProjectSourceFileOut(
            path="astro.config.mjs",
            role="config",
            language="javascript",
            contents='import react from "@astrojs/react";\nimport { defineConfig } from "astro/config";\n\nexport default defineConfig({ integrations: [react()] });\n',
        ),
        ProjectSourceFileOut(
            path="tsconfig.json",
            role="config",
            language="json",
            contents='{"extends":"astro/tsconfigs/strict","compilerOptions":{"jsx":"react-jsx"}}\n',
        ),
        ProjectSourceFileOut(
            path="src/env.d.ts",
            role="types",
            language="typescript",
            contents='/// <reference types="astro/client" />\n',
        ),
        ProjectSourceFileOut(
            path="src/pages/index.astro",
            role="entry",
            language="astro",
            contents='---\nimport BaseLayout from "../layouts/BaseLayout.astro";\nimport ReactIsland from "../components/ReactIsland";\nimport { getProjectSiteConfig } from "../arclayer/site-config";\n\nconst config = getProjectSiteConfig();\n---\n\n<BaseLayout title={config.site.name}>\n  <ReactIsland client:load />\n</BaseLayout>\n',
        ),
        ProjectSourceFileOut(
            path="src/layouts/BaseLayout.astro",
            role="entry",
            language="astro",
            contents='---\nimport "../styles/global.css";\nconst { title } = Astro.props;\n---\n\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width" />\n    <title>{title}</title>\n  </head>\n  <body><slot /></body>\n</html>\n',
        ),
        ProjectSourceFileOut(
            path="src/components/ReactIsland.tsx",
            role="entry",
            language="typescriptreact",
            contents=_astro_react_island_tsx(),
        ),
        ProjectSourceFileOut(
            path="src/styles/global.css",
            role="style",
            language="css",
            contents=_react_index_css(),
        ),
        ProjectSourceFileOut(
            path="src/arclayer/runtime.ts",
            role="runtime",
            language="typescript",
            contents=_runtime_config_ts(runtime_value),
        ),
        ProjectSourceFileOut(
            path="src/arclayer/site-config.ts",
            role="config",
            language="typescript",
            contents=_site_config_ts(project, settings_value, public_url=runtime_value.get("primaryUrl")),
        ),
        ProjectSourceFileOut(
            path="src/arclayer/content.ts",
            role="content",
            language="typescript",
            contents=_content_client_ts(env_key="PUBLIC_ARCLAYER_DELIVERY_URL"),
        ),
    ]


def _build_files(
    project: ProjectRecord,
    config: ProjectSourceConfig,
    settings_value: dict[str, Any],
    runtime_value: dict[str, Any],
) -> list[ProjectSourceFileOut]:
    if config.framework == "astro":
        return _astro_files(project, settings_value, runtime_value)
    return _react_vite_files(project, settings_value, runtime_value)


def _source_file_from_record(record: ProjectSourceFileRecordLike) -> ProjectSourceFileOut:
    return ProjectSourceFileOut(
        path=record.path,
        role=cast(ProjectSourceFileRole, record.role),
        language=record.language,
        contents=record.contents,
    )


def _source_kind(records: Sequence[ProjectSourceFileRecordLike]) -> ProjectSourceKind:
    return "managed_source" if records else "generated_scaffold"


def _language_from_path(path: str) -> str:
    for suffix, language in _LANGUAGE_BY_EXTENSION.items():
        if path.endswith(suffix):
            return language
    return "text"


def _role_from_path(path: str) -> ProjectSourceFileRole:
    if path in _CONFIG_FILE_NAMES:
        return "config"
    if path.endswith(".d.ts"):
        return "types"
    if path.endswith(".css"):
        return "style"
    if path.startswith("src/arclayer/runtime"):
        return "runtime"
    if path.startswith("src/arclayer/site-config"):
        return "config"
    if path.startswith("src/arclayer/content"):
        return "content"
    if path in {"src/App.tsx", "src/main.tsx", "src/pages/index.astro"}:
        return "entry"
    return "source"


def _resolve_file_role(
    path: str,
    *,
    scaffold_files: dict[str, ProjectSourceFileOut],
    override: ProjectSourceFileRole | None,
) -> ProjectSourceFileRole:
    if override is not None:
        return override
    scaffold_file = scaffold_files.get(path)
    if scaffold_file is not None:
        return scaffold_file.role
    return _role_from_path(path)


def _resolve_file_language(
    path: str,
    *,
    scaffold_files: dict[str, ProjectSourceFileOut],
    override: str | None,
) -> str:
    if override is not None and override.strip():
        return override.strip()
    scaffold_file = scaffold_files.get(path)
    if scaffold_file is not None:
        return scaffold_file.language
    return _language_from_path(path)


def _merge_source_files(
    *,
    scaffold_files: list[ProjectSourceFileOut],
    records: Sequence[ProjectSourceFileRecordLike],
) -> list[ProjectSourceFileOut]:
    merged = {file.path: file for file in scaffold_files}
    for record in records:
        if record.is_deleted:
            merged.pop(record.path, None)
            continue
        merged[record.path] = _source_file_from_record(record)
    return [merged[path] for path in sorted(merged)]


class ProjectSourceService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repo: ProjectRepository | None = None,
        settings_service: ProjectSettingsService | None = None,
        source_repo: ProjectSourceRepository | None = None,
        runtime_service: ProjectRuntimeService | None = None,
        domain_service: DomainBindingService | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repo or ProjectRepository()
        self.settings_service = settings_service or ProjectSettingsService(settings)
        self.source_repo = source_repo or ProjectSourceRepository()
        self.runtime_service = runtime_service or ProjectRuntimeService(settings)
        self.domain_service = domain_service or DomainBindingService(settings)

    async def _runtime_value(self, *, project: ProjectRecord) -> dict[str, Any]:
        runtime_context = await self.runtime_service.get_context_by_project(
            project_id=project.id,
            actor_user_id=None,
        )
        bindings = await self.domain_service.list_bindings_for_project(project_id=project.id)
        domains = [DomainBindingOut.model_validate(self.domain_service.to_out(binding)) for binding in bindings]
        return _runtime_config_payload(project=project, runtime_context=runtime_context, domains=domains)

    async def get_source_manifest(self, *, project_id: UUID) -> ProjectSourceManifestOut:
        project = await self.repo.get_project_by_id(project_id=project_id)
        settings_detail = await self.settings_service.get_core_detail(project_id=project_id)
        config = _source_config_from_settings(settings_detail.value)
        records = list(await self.source_repo.list_project_files(project_id=project_id))
        runtime_value = await self._runtime_value(project=project)
        scaffold_files = _build_files(project, config, settings_detail.value, runtime_value)
        return ProjectSourceManifestOut(
            project_id=project.id,
            source_kind=_source_kind(records),
            framework=config.framework,
            source_provider=config.source_provider,
            package_manager=config.package_manager,
            root_directory=config.root_directory,
            build_command=config.build_command,
            output_directory=config.output_directory,
            artifact_strategy=config.artifact_strategy,
            files=_merge_source_files(scaffold_files=scaffold_files, records=records),
        )

    async def get_source_file(self, *, project_id: UUID, path: str) -> ProjectSourceFileOut:
        project = await self.repo.get_project_by_id(project_id=project_id)
        settings_detail = await self.settings_service.get_core_detail(project_id=project_id)
        config = _source_config_from_settings(settings_detail.value)
        normalized_path = _normalize_source_file_path(path)
        runtime_value = await self._runtime_value(project=project)
        scaffold_files = {
            file.path: file for file in _build_files(project, config, settings_detail.value, runtime_value)
        }
        existing = await self.source_repo.get_project_file(project_id=project.id, path=normalized_path)
        if existing is not None:
            if existing.is_deleted:
                raise NotFound(
                    message=t("errors", "PROJECT_SOURCE_FILE_NOT_FOUND"),
                    error="PROJECT_SOURCE_FILE_NOT_FOUND",
                )
            return _source_file_from_record(existing)

        scaffold_file = scaffold_files.get(normalized_path)
        if scaffold_file is None:
            raise NotFound(
                message=t("errors", "PROJECT_SOURCE_FILE_NOT_FOUND"),
                error="PROJECT_SOURCE_FILE_NOT_FOUND",
            )
        return scaffold_file

    async def upsert_source_file(
        self,
        *,
        project_id: UUID,
        path: str,
        payload: ProjectSourceFileUpsertIn,
        actor_user_id: UUID,
    ) -> ProjectSourceFileOut:
        project = await self.repo.get_project_by_id(project_id=project_id)
        settings_detail = await self.settings_service.get_core_detail(project_id=project_id)
        config = _source_config_from_settings(settings_detail.value)
        if config.source_provider != "managed":
            raise Conflict(
                message=t("errors", "PROJECT_SOURCE_PROVIDER_READ_ONLY"),
                error="PROJECT_SOURCE_PROVIDER_READ_ONLY",
            )

        normalized_path = _normalize_source_file_path(path)
        runtime_value = await self._runtime_value(project=project)
        scaffold_files = {
            file.path: file for file in _build_files(project, config, settings_detail.value, runtime_value)
        }
        record = await self.source_repo.upsert_project_file(
            project_id=project.id,
            path=normalized_path,
            role=_resolve_file_role(normalized_path, scaffold_files=scaffold_files, override=payload.role),
            language=_resolve_file_language(normalized_path, scaffold_files=scaffold_files, override=payload.language),
            contents=payload.contents,
            actor_user_id=actor_user_id,
        )
        return _source_file_from_record(record)

    async def delete_source_file(
        self,
        *,
        project_id: UUID,
        path: str,
        actor_user_id: UUID,
    ) -> ProjectSourceFileDeleteOut:
        project = await self.repo.get_project_by_id(project_id=project_id)
        settings_detail = await self.settings_service.get_core_detail(project_id=project_id)
        config = _source_config_from_settings(settings_detail.value)
        if config.source_provider != "managed":
            raise Conflict(
                message=t("errors", "PROJECT_SOURCE_PROVIDER_READ_ONLY"),
                error="PROJECT_SOURCE_PROVIDER_READ_ONLY",
            )

        normalized_path = _normalize_source_file_path(path)
        runtime_value = await self._runtime_value(project=project)
        scaffold_files = {
            file.path: file for file in _build_files(project, config, settings_detail.value, runtime_value)
        }
        existing = await self.source_repo.get_project_file(project_id=project.id, path=normalized_path)
        if existing is None and normalized_path not in scaffold_files:
            raise NotFound(
                message=t("errors", "PROJECT_SOURCE_FILE_NOT_FOUND"),
                error="PROJECT_SOURCE_FILE_NOT_FOUND",
            )

        if normalized_path in scaffold_files:
            scaffold_file = scaffold_files[normalized_path]
            await self.source_repo.upsert_project_file(
                project_id=project.id,
                path=normalized_path,
                role=scaffold_file.role,
                language=scaffold_file.language,
                contents="",
                actor_user_id=actor_user_id,
                is_deleted=True,
            )
        else:
            await self.source_repo.delete_project_file(project_id=project.id, path=normalized_path)

        return ProjectSourceFileDeleteOut(project_id=project.id, path=normalized_path, deleted=True)
