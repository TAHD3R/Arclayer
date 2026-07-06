import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Code2,
  ExternalLink,
  FileCode2,
  FolderClosed,
  GitBranch,
  Globe,
  Monitor,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  getContentItemVersion,
  listAllContentItems,
  listContentHierarchyNodes,
  listContentRouteBindings,
  listContentVersionComponentBindings,
} from "@/api/content";
import { getProjectReleaseDryRun, listProjectReleases } from "@/api/project-releases";
import { getProjectSourceFile, getProjectSourceManifest } from "@/api/project-source";
import { getProjectDetail } from "@/api/projects";
import { listProjectDomains } from "@/api/project-settings";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import type {
  AdminContentItem,
  AdminContentComponentBinding,
  AdminContentHierarchyNode,
  AdminContentRouteBinding,
  AdminContentVersion,
  AdminRelease,
  AdminReleaseDryRun,
  ProjectSourceFile,
  ProjectSourceManifest,
} from "@arclayer/openapi/admin-types";

type ProjectEditorSiteOutline = {
  analyticsMeasurementId: string | null;
  appEntryPath: string | null;
  configPath: string | null;
  description: string | null;
  seoTitle: string | null;
  siteName: string | null;
  url: string | null;
};

type ProjectEditorContentSummary = {
  draftChanges: number;
  published: number;
  siteContent: number;
  sitePages: number;
};

type ProjectEditorSourceRoleSummary = {
  content: number;
  config: number;
  entry: number;
  runtime: number;
  source: number;
  style: number;
  types: number;
};

type ProjectEditorSourceTreeNode = {
  children: ProjectEditorSourceTreeNode[];
  file: ProjectSourceFile | null;
  name: string;
  path: string;
  type: "directory" | "file";
};

type ProjectEditorSourceKind = NonNullable<ProjectSourceManifest["sourceKind"]>;
type ProjectEditorSourceFramework = NonNullable<ProjectSourceManifest["framework"]>;

type ProjectEditorReadinessState = "ready" | "attention";

type ProjectEditorReadinessItem = {
  description: string;
  id: string;
  label: string;
  state: ProjectEditorReadinessState;
  value: string;
};

type ProjectEditorWorkflowLink = {
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
  value: string;
};

type ProjectEditorRuntimeBindingItem = {
  description: string;
  id: string;
  label: string;
  value: string;
};

type ProjectEditorReleaseSnapshot = {
  activeRelease: AdminRelease | null;
  dryRun: AdminReleaseDryRun | null;
  releaseCount: number;
};

type ProjectEditorHomePageSnapshot = {
  blueprintNodeCount: number | null;
  blueprintNodeTypes: string[];
  blueprintRootId: string | null;
  heroHeadline: string | null;
  heroSubheading: string | null;
  routePath: string | null;
  sectionsCount: number | null;
  title: string;
  versionNumber: number;
};

type ProjectEditorSiteStructure = {
  componentBindings: AdminContentComponentBinding[];
  hierarchyNodes: AdminContentHierarchyNode[];
  routeBindings: AdminContentRouteBinding[];
};

type ProjectEditorBlueprintSummary = Pick<
  ProjectEditorHomePageSnapshot,
  "blueprintNodeCount" | "blueprintNodeTypes" | "blueprintRootId"
>;

function buildProjectEditorWorkflowLinks(
  projectId: string,
  t: (key: string) => string,
): ProjectEditorWorkflowLink[] {
  return [
    {
      href: `/projects/${projectId}/editor`,
      icon: Monitor,
      id: "editor",
      label: t("account:PROJECT_EDITOR_WORKFLOW_EDITOR"),
      value: `/projects/${projectId}/editor`,
    },
    {
      href: `/projects/${projectId}/content/library`,
      icon: FileCode2,
      id: "content",
      label: t("account:PROJECT_EDITOR_WORKFLOW_CONTENT"),
      value: `/projects/${projectId}/content/library`,
    },
    {
      href: `/projects/${projectId}/website/domain`,
      icon: Globe,
      id: "website",
      label: t("account:PROJECT_EDITOR_WORKFLOW_WEBSITE"),
      value: `/projects/${projectId}/website/domain`,
    },
    {
      href: `/projects/${projectId}/seo/site`,
      icon: GitBranch,
      id: "config",
      label: t("account:PROJECT_EDITOR_WORKFLOW_CONFIG"),
      value: `/projects/${projectId}/seo/site`,
    },
    {
      href: `/projects/${projectId}/settings/general`,
      icon: Code2,
      id: "settings",
      label: t("account:PROJECT_EDITOR_WORKFLOW_SETTINGS"),
      value: `/projects/${projectId}/settings/general`,
    },
  ];
}

function normalizePreviewUrl(hostname: string | null): string | null {
  const value = (hostname ?? "").trim();
  if (!value) return null;
  return `https://${value}`;
}

function sourceEntryCandidates(framework: ProjectEditorSourceFramework | null): readonly string[] {
  if (framework === "astro") {
    return ["src/pages/index.astro", "src/components/ReactIsland.tsx", "src/App.tsx"];
  }
  return ["src/App.tsx", "src/pages/index.astro", "src/components/ReactIsland.tsx"];
}

function selectSourceEntryFile(
  files: readonly ProjectSourceFile[],
  framework: ProjectEditorSourceFramework | null,
): ProjectSourceFile | null {
  const candidates = sourceEntryCandidates(framework);
  for (const path of candidates) {
    const file = files.find((item) => item.path === path);
    if (file) return file;
  }
  return files.find((file) => file.role === "entry") ?? null;
}

function selectInitialSourcePath(
  files: readonly ProjectSourceFile[],
  framework: ProjectEditorSourceFramework | null,
): string | null {
  return selectSourceEntryFile(files, framework)?.path ?? files[0]?.path ?? null;
}

function formatSourceMeta(file: ProjectSourceFile | null): string {
  if (!file) return "";
  return [file.language, file.role].filter(Boolean).join(" / ");
}

function sourceKindTranslationKey(kind: ProjectEditorSourceKind, suffix: "DESC" | "LABEL"): string {
  return `account:PROJECT_EDITOR_SOURCE_KIND_${kind.toUpperCase()}_${suffix}`;
}

function formatContentItemTitle(item: AdminContentItem): string {
  return item.title?.trim() || item.slug || item.id;
}

function formatContentItemMeta(item: AdminContentItem): string {
  return [item.modelKey, item.role ?? item.resolvedRole, item.locale].filter(Boolean).join(" / ");
}

function isSiteContentItem(item: AdminContentItem): boolean {
  return item.libraryGroup === "site-content" || item.context === "site_builder";
}

function isSitePageItem(item: AdminContentItem): boolean {
  return item.role === "page" || item.resolvedRole === "page" || item.modelKey === "page";
}

function selectPrimarySitePageItem(items: readonly AdminContentItem[]): AdminContentItem | null {
  const pages = items.filter((item) => isSiteContentItem(item) && isSitePageItem(item));
  if (!pages.length) return null;

  return (
    pages.find((item) => item.slug === "home" || item.slug === "homepage") ??
    pages.find((item) => item.title?.trim().toLowerCase() === "home") ??
    pages.find((item) => item.publishedVersion !== null && item.publishedVersion !== undefined) ??
    pages[0] ??
    null
  );
}

function selectActiveRelease(releases: readonly AdminRelease[]): AdminRelease | null {
  return releases.find((release) => release.isActive) ?? null;
}

function resolveContentVersionNumber(item: AdminContentItem | null): number | null {
  if (!item) return null;
  if (Number.isFinite(item.draftVersion) && item.draftVersion > 0) return item.draftVersion;
  return item.publishedVersion ?? null;
}

function buildContentSummary(items: readonly AdminContentItem[]): ProjectEditorContentSummary {
  return items.reduce<ProjectEditorContentSummary>(
    (summary, item) => ({
      draftChanges:
        summary.draftChanges +
        (item.derivedStatus === "draft" || item.derivedStatus === "changed" ? 1 : 0),
      published: summary.published + (item.derivedStatus === "published" ? 1 : 0),
      siteContent: summary.siteContent + (isSiteContentItem(item) ? 1 : 0),
      sitePages: summary.sitePages + (isSiteContentItem(item) && isSitePageItem(item) ? 1 : 0),
    }),
    {
      draftChanges: 0,
      published: 0,
      siteContent: 0,
      sitePages: 0,
    },
  );
}

function buildSourceRoleSummary(
  files: readonly ProjectSourceFile[],
): ProjectEditorSourceRoleSummary {
  const summary: ProjectEditorSourceRoleSummary = {
    content: 0,
    config: 0,
    entry: 0,
    runtime: 0,
    source: 0,
    style: 0,
    types: 0,
  };
  for (const file of files) {
    summary[file.role] += 1;
  }
  return summary;
}

function createSourceTreeNode(
  input: Pick<ProjectEditorSourceTreeNode, "name" | "path" | "type"> & {
    file?: ProjectSourceFile | null;
  },
): ProjectEditorSourceTreeNode {
  return {
    children: [],
    file: input.file ?? null,
    name: input.name,
    path: input.path,
    type: input.type,
  };
}

function sortSourceTreeNodes(
  nodes: readonly ProjectEditorSourceTreeNode[],
): ProjectEditorSourceTreeNode[] {
  return [...nodes]
    .map((node) => Object.assign({}, node, { children: sortSourceTreeNodes(node.children) }))
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

function buildProjectSourceTree(
  files: readonly ProjectSourceFile[],
): ProjectEditorSourceTreeNode[] {
  const root = createSourceTreeNode({ name: "", path: "", type: "directory" });

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;
    for (const [index, part] of parts.entries()) {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let next = current.children.find((node) => node.name === part && node.path === path);
      if (!next) {
        next = createSourceTreeNode({
          file: isFile ? file : null,
          name: part,
          path,
          type: isFile ? "file" : "directory",
        });
        current.children.push(next);
      }
      if (isFile) {
        next.file = file;
      }
      current = next;
    }
  }

  return sortSourceTreeNodes(root.children);
}

function contentStatusLabelKey(item: AdminContentItem): string {
  if (item.derivedStatus === "changed") return "content:CONTENT_LIBRARY_STATUS_CHANGED";
  if (item.derivedStatus === "draft") return "content:CONTENT_LIBRARY_STATUS_DRAFT";
  if (item.derivedStatus === "archived") return "content:CONTENT_LIBRARY_STATUS_ARCHIVED";
  return "content:CONTENT_LIBRARY_STATUS_PUBLISHED";
}

function readNestedString(value: unknown, path: readonly string[]): string | null {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function readRecordString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const current = (value as Record<string, unknown>)[key];
  return typeof current === "string" && current.trim() ? current : null;
}

function readRecordArrayLength(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const current = (value as Record<string, unknown>)[key];
  return Array.isArray(current) ? current.length : null;
}

function getPresentationPayload(
  version: AdminContentVersion | null,
  kind: AdminContentVersion["presentations"][number]["kind"],
): Record<string, unknown> | null {
  const payload = version?.presentations.find(
    (presentation) => presentation.kind === kind,
  )?.payload;
  return payload && typeof payload === "object" ? payload : null;
}

function readVersionString(
  version: AdminContentVersion | null,
  keys: readonly string[],
): string | null {
  const formData = getPresentationPayload(version, "form_data");
  for (const key of keys) {
    const value = readRecordString(version?.fieldsSnapshot, key) ?? readRecordString(formData, key);
    if (value) return value;
  }
  return null;
}

function buildBlueprintSummary(version: AdminContentVersion): ProjectEditorBlueprintSummary {
  const payload = getPresentationPayload(version, "visual_blueprint");
  const nodesById = payload?.nodesById;
  const nodeRecords =
    nodesById && typeof nodesById === "object" && !Array.isArray(nodesById)
      ? Object.values(nodesById).filter(
          (node): node is Record<string, unknown> =>
            Boolean(node) && typeof node === "object" && !Array.isArray(node),
        )
      : [];
  const nodeTypes = [
    ...new Set(
      nodeRecords
        .map((node) => node.type)
        .filter((type): type is string => typeof type === "string" && Boolean(type.trim())),
    ),
  ];
  return {
    blueprintNodeCount: nodeRecords.length || null,
    blueprintNodeTypes: nodeTypes,
    blueprintRootId: readRecordString(payload, "rootId"),
  };
}

function buildHomePageSnapshot(
  item: AdminContentItem,
  version: AdminContentVersion,
): ProjectEditorHomePageSnapshot {
  const blueprint = buildBlueprintSummary(version);
  return {
    ...blueprint,
    heroHeadline: readVersionString(version, ["heroHeadline", "headline"]),
    heroSubheading: readVersionString(version, ["heroSubheading", "subheading", "description"]),
    routePath: readVersionString(version, ["path", "routePath", "slug"]),
    sectionsCount:
      readRecordArrayLength(version.fieldsSnapshot, "sections") ??
      readRecordArrayLength(getPresentationPayload(version, "form_data"), "sections"),
    title: readVersionString(version, ["title"]) ?? formatContentItemTitle(item),
    versionNumber: version.versionNumber,
  };
}

function describePrimaryRouteBinding(
  routeBindings: readonly AdminContentRouteBinding[],
  t: (key: string) => string,
): string {
  const route =
    routeBindings.find((binding) => binding.isActive && binding.path === "/") ??
    routeBindings.find((binding) => binding.isActive) ??
    routeBindings[0] ??
    null;
  return route?.path ?? t("account:PROJECT_EDITOR_SITE_STRUCTURE_EMPTY");
}

function describePrimaryHierarchyNode(
  hierarchyNodes: readonly AdminContentHierarchyNode[],
  t: (key: string) => string,
): string {
  const node =
    hierarchyNodes.find((item) => item.parentItemId === null || item.parentItemId === undefined) ??
    hierarchyNodes[0] ??
    null;
  return node?.itemId ?? t("account:PROJECT_EDITOR_SITE_STRUCTURE_EMPTY");
}

function describePrimaryComponentBinding(
  componentBindings: readonly AdminContentComponentBinding[],
  t: (key: string) => string,
): string {
  const binding = componentBindings[0] ?? null;
  return binding
    ? `${binding.bindingKey} / ${binding.componentKey}`
    : t("account:PROJECT_EDITOR_SITE_STRUCTURE_EMPTY");
}

function formatComponentBindingPayload(binding: AdminContentComponentBinding): string | null {
  const payload = binding.bindingPayload;
  if (!payload || typeof payload !== "object") return null;
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return entries.length ? entries.join(" · ") : null;
}

function parseGeneratedSiteConfig(contents: string): unknown {
  const assignment = contents.match(/(?:export\s+)?const\s+projectSiteConfig\s*=/);
  if (!assignment) return null;
  const literal = extractJsonObjectLiteral(contents, assignment.index! + assignment[0].length);
  if (!literal) return null;
  try {
    return JSON.parse(literal);
  } catch {
    return null;
  }
}

function extractJsonObjectLiteral(contents: string, startIndex: number): string | null {
  const objectStart = contents.indexOf("{", startIndex);
  if (objectStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < contents.length; index += 1) {
    const char = contents[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return contents.slice(objectStart, index + 1);
  }
  return null;
}

function resolveProjectEditorSiteOutline(
  files: readonly ProjectSourceFile[],
  framework: ProjectEditorSourceFramework | null,
  project: { description?: string | null; name?: string | null } | null,
  previewUrl: string | null,
): ProjectEditorSiteOutline {
  const configFile = files.find((file) => file.path === "src/arclayer/site-config.ts") ?? null;
  const appEntry = selectSourceEntryFile(files, framework);
  const config = configFile ? parseGeneratedSiteConfig(configFile.contents) : null;
  const siteName = readNestedString(config, ["site", "name"]) ?? project?.name ?? null;
  const description =
    readNestedString(config, ["site", "description"]) ??
    readNestedString(config, ["seo", "defaultDescription"]) ??
    project?.description ??
    null;

  return {
    analyticsMeasurementId: readNestedString(config, [
      "analytics",
      "googleAnalytics",
      "measurementId",
    ]),
    appEntryPath: appEntry?.path ?? null,
    configPath: configFile?.path ?? null,
    description,
    seoTitle: readNestedString(config, ["seo", "defaultTitle"]),
    siteName,
    url: readNestedString(config, ["site", "url"]) ?? previewUrl,
  };
}

function buildProjectEditorReadiness(input: {
  contentSummary: ProjectEditorContentSummary;
  previewUrl: string | null;
  releaseSnapshot: ProjectEditorReleaseSnapshot;
  siteOutline: ProjectEditorSiteOutline;
  sourceFramework: ProjectEditorSourceFramework | null;
  sourceFiles: readonly ProjectSourceFile[];
  t: (key: string, options?: Record<string, unknown>) => string;
}): ProjectEditorReadinessItem[] {
  const hasAppEntry = selectSourceEntryFile(input.sourceFiles, input.sourceFramework) !== null;
  const hasSiteConfig = Boolean(input.siteOutline.configPath);
  const sourceFileCount = input.sourceFiles.length;

  return [
    {
      id: "domain",
      label: input.t("account:PROJECT_EDITOR_READINESS_DOMAIN_LABEL"),
      description: input.t("account:PROJECT_EDITOR_READINESS_DOMAIN_DESC"),
      state: input.previewUrl ? "ready" : "attention",
      value: input.previewUrl ?? input.t("account:PROJECT_EDITOR_NO_DOMAIN"),
    },
    {
      id: "config",
      label: input.t("account:PROJECT_EDITOR_READINESS_CONFIG_LABEL"),
      description: input.t("account:PROJECT_EDITOR_READINESS_CONFIG_DESC"),
      state: hasSiteConfig ? "ready" : "attention",
      value: input.siteOutline.configPath ?? input.t("account:PROJECT_EDITOR_SOURCE_NO_FILE"),
    },
    {
      id: "content",
      label: input.t("account:PROJECT_EDITOR_READINESS_CONTENT_LABEL"),
      description: input.t("account:PROJECT_EDITOR_READINESS_CONTENT_DESC"),
      state: input.contentSummary.sitePages > 0 ? "ready" : "attention",
      value: input.t("account:PROJECT_EDITOR_READINESS_CONTENT_VALUE", {
        count: input.contentSummary.sitePages,
      }),
    },
    {
      id: "release",
      label: input.t("account:PROJECT_EDITOR_READINESS_RELEASE_LABEL"),
      description: input.t("account:PROJECT_EDITOR_READINESS_RELEASE_DESC"),
      state: input.releaseSnapshot.activeRelease ? "ready" : "attention",
      value: input.releaseSnapshot.activeRelease
        ? input.t("account:PROJECT_EDITOR_RELEASE_VALUE", {
            count: input.releaseSnapshot.activeRelease.releaseNumber,
          })
        : input.t("account:PROJECT_EDITOR_RELEASE_EMPTY"),
    },
    {
      id: "source",
      label: input.t("account:PROJECT_EDITOR_READINESS_SOURCE_LABEL"),
      description: input.t("account:PROJECT_EDITOR_READINESS_SOURCE_DESC"),
      state: hasAppEntry && sourceFileCount > 0 ? "ready" : "attention",
      value: input.t("account:PROJECT_EDITOR_READINESS_SOURCE_VALUE", {
        count: sourceFileCount,
      }),
    },
  ];
}

function ProjectEditorReadinessStrip(props: {
  items: readonly ProjectEditorReadinessItem[];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const stateClassName: Record<ProjectEditorReadinessState, string> = {
    attention: "border-amber-500/30 bg-amber-500/6 text-amber-700 dark:text-amber-300",
    ready: "border-positive/30 bg-positive/5 text-positive",
  };

  return (
    <section
      aria-label={props.t("account:PROJECT_EDITOR_READINESS_LABEL")}
      className="grid gap-2 rounded-lg border border-border bg-card px-3 py-3 md:grid-cols-2 xl:grid-cols-5"
      data-testid="project-editor-readiness"
    >
      {props.items.map((item) => (
        <div
          key={item.id}
          className="min-w-0 rounded-md border border-border bg-background px-3 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-caption font-semibold text-label-primary">{item.label}</p>
            <span
              className={`shrink-0 rounded-sm border px-2 py-0.5 text-caption2 font-medium ${stateClassName[item.state]}`}
            >
              {props.t(`account:PROJECT_EDITOR_READINESS_STATE_${item.state.toUpperCase()}`)}
            </span>
          </div>
          <p className="mt-2 truncate text-footnote font-medium text-label-primary">{item.value}</p>
          <p className="mt-1 line-clamp-2 text-caption1 text-label-secondary">{item.description}</p>
        </div>
      ))}
    </section>
  );
}

function ProjectEditorWorkflowLinks(props: {
  links: readonly ProjectEditorWorkflowLink[];
  t: (key: string) => string;
}) {
  return (
    <section
      aria-label={props.t("account:PROJECT_EDITOR_WORKFLOW_LABEL")}
      className="rounded-lg border border-border bg-card px-3 py-3"
      data-testid="project-editor-workflow-links"
    >
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {props.links.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.id}
              href={link.href}
              className="group flex min-w-0 items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-label-secondary group-hover:text-label-primary">
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-footnote font-semibold text-label-primary">
                  {link.label}
                </span>
                <span className="block truncate text-caption2 text-label-secondary">
                  {link.value}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function buildProjectEditorRuntimeBindings(input: {
  releaseSnapshot: ProjectEditorReleaseSnapshot;
  siteOutline: ProjectEditorSiteOutline;
  sourceFiles: readonly ProjectSourceFile[];
  t: (key: string, options?: Record<string, unknown>) => string;
}): ProjectEditorRuntimeBindingItem[] {
  const runtimeIdentityPath =
    input.sourceFiles.find((file) => file.path === "src/arclayer/runtime.ts")?.path ?? null;
  const contentRuntimePath =
    input.sourceFiles.find((file) => file.path === "src/arclayer/content.ts")?.path ?? null;

  return [
    {
      id: "site-config",
      label: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_CONFIG_LABEL"),
      description: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_CONFIG_DESC"),
      value: input.siteOutline.configPath ?? input.t("account:PROJECT_EDITOR_SOURCE_NO_FILE"),
    },
    {
      id: "runtime-identity",
      label: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_RUNTIME_LABEL"),
      description: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_RUNTIME_DESC"),
      value: runtimeIdentityPath ?? input.t("account:PROJECT_EDITOR_SOURCE_NO_FILE"),
    },
    {
      id: "content-runtime",
      label: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_CONTENT_LABEL"),
      description: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_CONTENT_DESC"),
      value: contentRuntimePath ?? input.t("account:PROJECT_EDITOR_SOURCE_NO_FILE"),
    },
    {
      id: "app-entry",
      label: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_ENTRY_LABEL"),
      description: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_ENTRY_DESC"),
      value: input.siteOutline.appEntryPath ?? input.t("account:PROJECT_EDITOR_SOURCE_NO_FILE"),
    },
    {
      id: "release",
      label: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_RELEASE_LABEL"),
      description: input.t("account:PROJECT_EDITOR_RUNTIME_BINDING_RELEASE_DESC"),
      value: input.releaseSnapshot.activeRelease
        ? input.t("account:PROJECT_EDITOR_RELEASE_VALUE", {
            count: input.releaseSnapshot.activeRelease.releaseNumber,
          })
        : input.t("account:PROJECT_EDITOR_RELEASE_EMPTY"),
    },
  ];
}

function ProjectEditorRuntimeBindingPanel(props: {
  items: readonly ProjectEditorRuntimeBindingItem[];
  t: (key: string) => string;
}) {
  return (
    <section
      aria-label={props.t("account:PROJECT_EDITOR_RUNTIME_BINDING_TITLE")}
      className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-3"
      data-testid="project-editor-runtime-binding"
    >
      <div className="text-caption font-semibold text-label-primary">
        {props.t("account:PROJECT_EDITOR_RUNTIME_BINDING_TITLE")}
      </div>
      <p className="mt-1 text-caption1 text-label-secondary">
        {props.t("account:PROJECT_EDITOR_RUNTIME_BINDING_DESC")}
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {props.items.map((item) => (
          <div
            key={item.id}
            className="min-w-0 rounded-sm border border-border bg-background px-2 py-2"
          >
            <dt className="truncate text-caption font-medium text-label-primary">{item.label}</dt>
            <dd className="mt-1 truncate font-mono text-caption text-label-secondary">
              {item.value}
            </dd>
            <dd className="mt-1 line-clamp-2 text-caption1 text-label-secondary">
              {item.description}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProjectEditorSourceTree(props: {
  nodes: readonly ProjectEditorSourceTreeNode[];
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
}) {
  if (!props.nodes.length) return null;

  return (
    <div className="space-y-1" role="tree">
      {props.nodes.map((node) => (
        <ProjectEditorSourceTreeNode
          key={node.path || node.name}
          depth={0}
          node={node}
          onSelectFile={props.onSelectFile}
          selectedPath={props.selectedPath}
        />
      ))}
    </div>
  );
}

function ProjectEditorSourceTreeNode(props: {
  depth: number;
  node: ProjectEditorSourceTreeNode;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
}) {
  const indent = `${props.depth * 0.875}rem`;

  if (props.node.type === "directory") {
    return (
      <div role="treeitem" aria-expanded="true" aria-label={props.node.name}>
        <div
          className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-footnote font-medium text-label-secondary"
          style={{ paddingLeft: `calc(0.5rem + ${indent})` }}
        >
          <FolderClosed size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{props.node.name}</span>
        </div>
        <div role="group" className="space-y-1">
          {props.node.children.map((child) => (
            <ProjectEditorSourceTreeNode
              key={child.path}
              depth={props.depth + 1}
              node={child}
              onSelectFile={props.onSelectFile}
              selectedPath={props.selectedPath}
            />
          ))}
        </div>
      </div>
    );
  }

  const selected = props.selectedPath === props.node.path;

  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={selected}
      onClick={() => props.onSelectFile(props.node.path)}
      className={cn(
        "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left",
        "text-label-secondary transition-colors hover:bg-muted hover:text-label-primary",
        selected && "bg-muted text-label-primary",
      )}
      style={{ paddingLeft: `calc(0.5rem + ${indent})` }}
    >
      <FileCode2 size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote font-medium">{props.node.name}</span>
        <span className="block truncate text-caption2 text-label-tertiary">{props.node.path}</span>
      </span>
    </button>
  );
}

export function ProjectEditorPage(props: { projectId: string }) {
  const { t } = useTranslation(["nav", "account", "common", "content"]);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const sourceQueryKey = ["project", "source", props.projectId, "manifest"] as const;
  const projectQuery = useQuery({
    queryKey: ["project", "detail", props.projectId, "editor"],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectDetail(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const domainsQuery = useQuery({
    queryKey: ["project", "domains", props.projectId, "editor-preview"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDomains(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const sourceQuery = useQuery({
    queryKey: sourceQueryKey,
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectSourceManifest(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const contentItemsQuery = useQuery({
    queryKey: ["project", "content", props.projectId, "editor", "items"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listAllContentItems(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const routeBindingsQuery = useQuery({
    queryKey: ["project", "content", props.projectId, "editor", "route-bindings"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listContentRouteBindings(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const hierarchyNodesQuery = useQuery({
    queryKey: ["project", "content", props.projectId, "editor", "hierarchy"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listContentHierarchyNodes(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const releasesQuery = useQuery({
    queryKey: ["project", "releases", props.projectId, "editor"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectReleases(props.projectId),
    retry: false,
    meta: { silent: true },
  });
  const releaseDryRunQuery = useQuery({
    queryKey: ["project", "releases", props.projectId, "editor", "dry-run"],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectReleaseDryRun(props.projectId),
    retry: false,
    meta: { silent: true },
  });

  const previewDomain = useMemo(() => {
    const domains = domainsQuery.data ?? [];
    return (
      domains.find((domain) => domain.isPrimary && domain.isVerified && domain.isActive) ??
      domains.find((domain) => domain.isVerified && domain.isActive) ??
      domains.find((domain) => domain.isActive) ??
      domains[0] ??
      null
    );
  }, [domainsQuery.data]);
  const previewUrl = normalizePreviewUrl(previewDomain?.hostname ?? null);
  const project = projectQuery.data?.project ?? null;
  const sourceFiles = sourceQuery.data?.files ?? [];
  const sourceFramework = sourceQuery.data?.framework ?? null;
  const sourceTree = useMemo(() => buildProjectSourceTree(sourceFiles), [sourceFiles]);
  const sourceRoleSummary = useMemo(() => buildSourceRoleSummary(sourceFiles), [sourceFiles]);
  const siteOutline = useMemo(
    () => resolveProjectEditorSiteOutline(sourceFiles, sourceFramework, project, previewUrl),
    [project, previewUrl, sourceFiles, sourceFramework],
  );
  const contentItems = contentItemsQuery.data ?? [];
  const releases = releasesQuery.data ?? [];
  const releaseSnapshot = useMemo<ProjectEditorReleaseSnapshot>(
    () => ({
      activeRelease: selectActiveRelease(releases),
      dryRun: releaseDryRunQuery.data ?? null,
      releaseCount: releases.length,
    }),
    [releaseDryRunQuery.data, releases],
  );
  const visibleContentItems = useMemo(() => contentItems.slice(0, 8), [contentItems]);
  const contentSummary = useMemo(() => buildContentSummary(contentItems), [contentItems]);
  const primarySitePage = useMemo(() => selectPrimarySitePageItem(contentItems), [contentItems]);
  const primarySitePageVersionNumber = resolveContentVersionNumber(primarySitePage);
  const componentBindingsEnabled = Boolean(
    props.projectId && primarySitePage?.id && primarySitePageVersionNumber,
  );
  const primarySitePageVersionQuery = useQuery({
    queryKey: [
      "project",
      "content",
      props.projectId,
      "editor",
      "home-page-version",
      primarySitePage?.id,
      primarySitePageVersionNumber,
    ] as const,
    enabled: Boolean(props.projectId && primarySitePage?.id && primarySitePageVersionNumber),
    queryFn: async () => {
      if (!primarySitePage?.id || !primarySitePageVersionNumber) {
        throw new Error("PROJECT_EDITOR_HOME_PAGE_VERSION_QUERY_INVALID");
      }
      return getContentItemVersion(
        props.projectId,
        primarySitePage.id,
        primarySitePageVersionNumber,
      );
    },
    retry: false,
    meta: { silent: true },
  });
  const componentBindingsQuery = useQuery({
    queryKey: [
      "project",
      "content",
      props.projectId,
      "editor",
      "component-bindings",
      primarySitePage?.id,
      primarySitePageVersionNumber,
    ] as const,
    enabled: componentBindingsEnabled,
    queryFn: async () => {
      if (!primarySitePage?.id || !primarySitePageVersionNumber) {
        throw new Error("PROJECT_EDITOR_COMPONENT_BINDINGS_QUERY_INVALID");
      }
      return listContentVersionComponentBindings(
        props.projectId,
        primarySitePage.id,
        primarySitePageVersionNumber,
      );
    },
    retry: false,
    meta: { silent: true },
  });
  const primarySitePageSnapshot = useMemo(
    () =>
      primarySitePage && primarySitePageVersionQuery.data
        ? buildHomePageSnapshot(primarySitePage, primarySitePageVersionQuery.data)
        : null,
    [primarySitePage, primarySitePageVersionQuery.data],
  );
  const siteStructure = useMemo<ProjectEditorSiteStructure>(
    () => ({
      componentBindings: componentBindingsQuery.data?.items ?? [],
      hierarchyNodes: hierarchyNodesQuery.data ?? [],
      routeBindings: routeBindingsQuery.data ?? [],
    }),
    [componentBindingsQuery.data, hierarchyNodesQuery.data, routeBindingsQuery.data],
  );
  const readinessItems = useMemo(
    () =>
      buildProjectEditorReadiness({
        contentSummary,
        previewUrl,
        releaseSnapshot,
        siteOutline,
        sourceFramework,
        sourceFiles,
        t,
      }),
    [contentSummary, previewUrl, releaseSnapshot, siteOutline, sourceFiles, sourceFramework, t],
  );
  const runtimeBindings = useMemo(
    () =>
      buildProjectEditorRuntimeBindings({
        releaseSnapshot,
        siteOutline,
        sourceFiles,
        t,
      }),
    [releaseSnapshot, siteOutline, sourceFiles, t],
  );
  const workflowLinks = useMemo(
    () => buildProjectEditorWorkflowLinks(props.projectId, t),
    [props.projectId, t],
  );
  const selectedSourceFile = useMemo(
    () =>
      selectedSourcePath
        ? (sourceFiles.find((file) => file.path === selectedSourcePath) ?? null)
        : null,
    [selectedSourcePath, sourceFiles],
  );
  const selectedSourceFileQuery = useQuery({
    queryKey: [
      "project",
      "source",
      props.projectId,
      "file",
      selectedSourceFile?.path ?? null,
    ] as const,
    enabled: Boolean(props.projectId && selectedSourceFile?.path),
    queryFn: async () => {
      if (!selectedSourceFile?.path) throw new Error("PROJECT_EDITOR_SOURCE_FILE_QUERY_INVALID");
      return getProjectSourceFile(props.projectId, selectedSourceFile.path);
    },
    retry: false,
    meta: { silent: true },
  });
  const sourceProvider = sourceQuery.data?.sourceProvider ?? null;
  const sourceKind = sourceQuery.data?.sourceKind ?? null;
  const selectedSourceContents = selectedSourceFileQuery.isLoading
    ? t("account:PROJECT_EDITOR_SOURCE_FILE_LOADING")
    : selectedSourceFileQuery.isError
      ? t("account:PROJECT_EDITOR_SOURCE_FILE_ERROR")
      : (selectedSourceFileQuery.data?.contents ?? "");
  const loadError =
    projectQuery.error ??
    domainsQuery.error ??
    sourceQuery.error ??
    contentItemsQuery.error ??
    routeBindingsQuery.error ??
    hierarchyNodesQuery.error ??
    releasesQuery.error ??
    releaseDryRunQuery.error ??
    primarySitePageVersionQuery.error ??
    componentBindingsQuery.error ??
    null;
  const loading =
    (projectQuery.isLoading && !projectQuery.data) ||
    (domainsQuery.isLoading && !domainsQuery.data) ||
    (sourceQuery.isLoading && !sourceQuery.data) ||
    (contentItemsQuery.isLoading && !contentItemsQuery.data) ||
    (routeBindingsQuery.isLoading && !routeBindingsQuery.data) ||
    (hierarchyNodesQuery.isLoading && !hierarchyNodesQuery.data) ||
    (releasesQuery.isLoading && !releasesQuery.data) ||
    (releaseDryRunQuery.isLoading && !releaseDryRunQuery.data) ||
    (primarySitePageVersionQuery.isLoading && !primarySitePageVersionQuery.data) ||
    (componentBindingsEnabled && componentBindingsQuery.isLoading && !componentBindingsQuery.data);

  useEffect(() => {
    if (!sourceFiles.length) {
      setSelectedSourcePath(null);
      return;
    }
    if (selectedSourcePath && sourceFiles.some((file) => file.path === selectedSourcePath)) {
      return;
    }
    setSelectedSourcePath(selectInitialSourcePath(sourceFiles, sourceFramework));
  }, [selectedSourcePath, sourceFiles, sourceFramework]);

  return (
    <DefaultPage
      title={t("nav:NAV_PROJECT_EDITOR")}
      description={t("account:PROJECT_EDITOR_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
      action={
        previewUrl ? (
          <Button asChild variant="outline">
            <a href={previewUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              {t("account:PROJECT_EDITOR_OPEN_SITE")}
            </a>
          </Button>
        ) : null
      }
    >
      <ContentGuard
        loading={loading}
        loadingVariant="form"
        error={loadError}
        onRetry={
          loadError
            ? () => {
                void projectQuery.refetch();
                void domainsQuery.refetch();
                void sourceQuery.refetch();
                void contentItemsQuery.refetch();
                void routeBindingsQuery.refetch();
                void hierarchyNodesQuery.refetch();
                void releasesQuery.refetch();
                void releaseDryRunQuery.refetch();
                if (primarySitePageVersionQuery.error) void primarySitePageVersionQuery.refetch();
                if (componentBindingsQuery.error) void componentBindingsQuery.refetch();
              }
            : undefined
        }
      >
        <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-headline font-semibold text-label-primary">
                <Monitor size={16} />
                <span className="truncate">
                  {project?.name ?? t("account:PROJECT_EDITOR_SITE_PREVIEW")}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-footnote text-label-secondary">
                <Globe size={14} />
                <span className="truncate">
                  {previewUrl ?? t("account:PROJECT_EDITOR_NO_DOMAIN")}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                void projectQuery.refetch();
                void domainsQuery.refetch();
                void sourceQuery.refetch();
                void contentItemsQuery.refetch();
                void routeBindingsQuery.refetch();
                void hierarchyNodesQuery.refetch();
                void releasesQuery.refetch();
                void releaseDryRunQuery.refetch();
                if (primarySitePageVersionQuery.error) void primarySitePageVersionQuery.refetch();
                if (componentBindingsQuery.error) void componentBindingsQuery.refetch();
              }}
            >
              <RefreshCw size={16} />
              {t("common:REFRESH")}
            </Button>
          </div>

          <ProjectEditorReadinessStrip items={readinessItems} t={t} />

          <ProjectEditorWorkflowLinks links={workflowLinks} t={t} />

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div
              className={cn(
                "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background",
                "shadow-[0_24px_80px_rgba(15,23,42,0.08)]",
              )}
            >
              <section className="border-b border-border bg-card/80 px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-callout font-semibold text-label-primary">
                      <Monitor size={16} />
                      <span>{t("account:PROJECT_EDITOR_SITE_OUTLINE_TITLE")}</span>
                    </div>
                    <h2 className="mt-2 truncate text-title3 font-semibold text-label-primary">
                      {siteOutline.siteName ??
                        project?.name ??
                        t("account:PROJECT_EDITOR_SITE_PREVIEW")}
                    </h2>
                    {siteOutline.description ? (
                      <p className="mt-1 line-clamp-2 max-w-3xl text-footnote text-label-secondary">
                        {siteOutline.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid min-w-0 gap-2 text-caption1 sm:grid-cols-2 lg:w-[460px]">
                    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_URL_LABEL")}
                      </div>
                      <div className="mt-1 truncate font-medium text-label-primary">
                        {siteOutline.url ?? t("account:PROJECT_EDITOR_NO_DOMAIN")}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_SEO_TITLE_LABEL")}
                      </div>
                      <div className="mt-1 truncate font-medium text-label-primary">
                        {siteOutline.seoTitle ??
                          siteOutline.siteName ??
                          t("account:PROJECT_EDITOR_SOURCE_KIND_PENDING")}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_ANALYTICS_LABEL")}
                      </div>
                      <div className="mt-1 truncate font-medium text-label-primary">
                        {siteOutline.analyticsMeasurementId ??
                          t("account:PROJECT_EDITOR_SITE_ANALYTICS_EMPTY")}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_SOURCE_LABEL")}
                      </div>
                      <div className="mt-1 truncate font-medium text-label-primary">
                        {siteOutline.configPath ??
                          siteOutline.appEntryPath ??
                          t("account:PROJECT_EDITOR_SOURCE_NO_FILE")}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-label-tertiary">
                        {t("account:PROJECT_EDITOR_RELEASE_LABEL")}
                      </div>
                      <div className="mt-1 truncate font-medium text-label-primary">
                        {releaseSnapshot.activeRelease
                          ? t("account:PROJECT_EDITOR_RELEASE_VALUE", {
                              count: releaseSnapshot.activeRelease.releaseNumber,
                            })
                          : t("account:PROJECT_EDITOR_RELEASE_EMPTY")}
                      </div>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-label-tertiary">
                        {t("account:PROJECT_EDITOR_RELEASE_READINESS_LABEL")}
                      </div>
                      <div className="mt-1 truncate font-medium text-label-primary">
                        {releaseSnapshot.dryRun?.readinessSummary.ready
                          ? t("account:PROJECT_EDITOR_RELEASE_READINESS_READY")
                          : releaseSnapshot.dryRun
                            ? t("account:PROJECT_EDITOR_RELEASE_READINESS_BLOCKED")
                            : t("account:PROJECT_EDITOR_RELEASE_READINESS_PENDING")}
                      </div>
                    </div>
                  </div>
                </div>
                <section
                  aria-label={t("account:PROJECT_EDITOR_SITE_STRUCTURE_TITLE")}
                  className="mt-4 rounded-lg border border-border bg-background px-3 py-3"
                  data-testid="project-editor-site-structure"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-footnote font-semibold text-label-primary">
                      {t("account:PROJECT_EDITOR_SITE_STRUCTURE_TITLE")}
                    </h3>
                    <span className="rounded-full border border-border bg-muted px-2 py-1 text-caption2 font-medium text-label-secondary">
                      {siteStructure.routeBindings.length + siteStructure.hierarchyNodes.length}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 text-caption1 md:grid-cols-3">
                    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
                      <dt className="truncate text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_ROUTES_LABEL")}
                      </dt>
                      <dd className="mt-1 text-title3 font-semibold text-label-primary">
                        {siteStructure.routeBindings.length}
                      </dd>
                      <p className="mt-1 truncate text-caption2 text-label-secondary">
                        {describePrimaryRouteBinding(siteStructure.routeBindings, t)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
                      <dt className="truncate text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_HIERARCHY_LABEL")}
                      </dt>
                      <dd className="mt-1 text-title3 font-semibold text-label-primary">
                        {siteStructure.hierarchyNodes.length}
                      </dd>
                      <p className="mt-1 truncate text-caption2 text-label-secondary">
                        {describePrimaryHierarchyNode(siteStructure.hierarchyNodes, t)}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
                      <dt className="truncate text-label-tertiary">
                        {t("account:PROJECT_EDITOR_SITE_COMPONENTS_LABEL")}
                      </dt>
                      <dd className="mt-1 text-title3 font-semibold text-label-primary">
                        {siteStructure.componentBindings.length}
                      </dd>
                      <p className="mt-1 truncate text-caption2 text-label-secondary">
                        {describePrimaryComponentBinding(siteStructure.componentBindings, t)}
                      </p>
                    </div>
                  </dl>
                </section>
              </section>
              {previewUrl ? (
                <iframe
                  title={t("account:PROJECT_EDITOR_SITE_PREVIEW")}
                  src={previewUrl}
                  className="min-h-[560px] flex-1 border-0 bg-white"
                  sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                />
              ) : (
                <div className="grid min-h-[560px] flex-1 place-items-center px-6 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted text-label-secondary">
                      <Globe size={20} />
                    </div>
                    <h2 className="mt-4 text-title3 font-semibold text-label-primary">
                      {t("account:PROJECT_EDITOR_NO_DOMAIN_TITLE")}
                    </h2>
                    <p className="mt-2 text-callout text-label-secondary">
                      {t("account:PROJECT_EDITOR_NO_DOMAIN_DESC")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <aside className="flex min-h-[680px] flex-col overflow-hidden rounded-xl border border-border bg-card">
              <section className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-callout font-semibold text-label-primary">
                      <Monitor size={16} />
                      <span>{t("account:PROJECT_EDITOR_CONTENT_TITLE")}</span>
                    </div>
                    <p className="mt-1 text-caption1 text-label-secondary">
                      {t("account:PROJECT_EDITOR_CONTENT_DESC")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-caption2 font-medium text-label-secondary">
                    {contentItems.length}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 text-caption1">
                  {[
                    {
                      id: "site-pages",
                      label: t("content:CONTENT_LIBRARY_WORKBENCH_METRIC_SITE_PAGES"),
                      value: contentSummary.sitePages,
                    },
                    {
                      id: "site-content",
                      label: t("content:CONTENT_LIBRARY_WORKBENCH_METRIC_SITE_CONTENT"),
                      value: contentSummary.siteContent,
                    },
                    {
                      id: "published",
                      label: t("content:CONTENT_LIBRARY_WORKBENCH_METRIC_PUBLISHED"),
                      value: contentSummary.published,
                    },
                    {
                      id: "drafts",
                      label: t("content:CONTENT_LIBRARY_WORKBENCH_METRIC_DRAFTS"),
                      value: contentSummary.draftChanges,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.id}
                      className="min-w-0 rounded-md border border-border bg-background px-2 py-2"
                    >
                      <dt className="truncate text-label-tertiary">{metric.label}</dt>
                      <dd className="mt-1 text-title3 font-semibold text-label-primary">
                        {metric.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <section
                  aria-label={t("account:PROJECT_EDITOR_HOME_PAGE_LABEL")}
                  className="mt-3 rounded-lg border border-border bg-background px-3 py-3"
                  data-testid="project-editor-homepage"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-caption1 font-semibold uppercase tracking-normal text-label-tertiary">
                        {t("account:PROJECT_EDITOR_HOME_PAGE_LABEL")}
                      </div>
                      <h3 className="mt-1 truncate text-callout font-semibold text-label-primary">
                        {primarySitePageSnapshot?.title ??
                          primarySitePage?.title ??
                          t("account:PROJECT_EDITOR_HOME_PAGE_EMPTY_TITLE")}
                      </h3>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-caption2 font-medium text-label-secondary">
                      {primarySitePageSnapshot
                        ? t("account:PROJECT_EDITOR_HOME_PAGE_VERSION", {
                            version: primarySitePageSnapshot.versionNumber,
                          })
                        : t("account:PROJECT_EDITOR_SOURCE_READONLY_BADGE")}
                    </span>
                  </div>
                  {primarySitePageSnapshot ? (
                    <div className="mt-3 grid gap-2 text-caption1">
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-label-tertiary">
                          {t("account:PROJECT_EDITOR_HOME_PAGE_ROUTE_LABEL")}
                        </span>
                        <span className="truncate font-medium text-label-primary">
                          {primarySitePageSnapshot.routePath ??
                            t("account:PROJECT_EDITOR_HOME_PAGE_ROUTE_EMPTY")}
                        </span>
                      </div>
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-label-tertiary">
                          {t("account:PROJECT_EDITOR_HOME_PAGE_HERO_LABEL")}
                        </span>
                        <span className="line-clamp-2 font-medium text-label-primary">
                          {primarySitePageSnapshot.heroHeadline ??
                            t("account:PROJECT_EDITOR_HOME_PAGE_HERO_EMPTY")}
                        </span>
                      </div>
                      {primarySitePageSnapshot.heroSubheading ? (
                        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                          <span className="text-label-tertiary">
                            {t("account:PROJECT_EDITOR_HOME_PAGE_SUBHEADING_LABEL")}
                          </span>
                          <span className="line-clamp-2 text-label-secondary">
                            {primarySitePageSnapshot.heroSubheading}
                          </span>
                        </div>
                      ) : null}
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-label-tertiary">
                          {t("account:PROJECT_EDITOR_HOME_PAGE_SECTIONS_LABEL")}
                        </span>
                        <span className="truncate text-label-secondary">
                          {primarySitePageSnapshot.sectionsCount === null
                            ? t("account:PROJECT_EDITOR_HOME_PAGE_SECTIONS_EMPTY")
                            : t("account:PROJECT_EDITOR_HOME_PAGE_SECTIONS_VALUE", {
                                count: primarySitePageSnapshot.sectionsCount,
                              })}
                        </span>
                      </div>
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                        <span className="text-label-tertiary">
                          {t("account:PROJECT_EDITOR_HOME_PAGE_BLUEPRINT_LABEL")}
                        </span>
                        <span className="truncate text-label-secondary">
                          {primarySitePageSnapshot.blueprintNodeCount === null
                            ? t("account:PROJECT_EDITOR_HOME_PAGE_BLUEPRINT_EMPTY")
                            : t("account:PROJECT_EDITOR_HOME_PAGE_BLUEPRINT_VALUE", {
                                count: primarySitePageSnapshot.blueprintNodeCount,
                                root:
                                  primarySitePageSnapshot.blueprintRootId ??
                                  t("account:PROJECT_EDITOR_SITE_STRUCTURE_EMPTY"),
                              })}
                        </span>
                      </div>
                      {primarySitePageSnapshot.blueprintNodeTypes.length ? (
                        <div className="flex min-w-0 flex-wrap gap-1 pl-[104px]">
                          {primarySitePageSnapshot.blueprintNodeTypes.slice(0, 6).map((type) => (
                            <span
                              key={type}
                              className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-caption2 text-label-secondary"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="border-t border-border pt-2">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="text-caption1 font-medium text-label-tertiary">
                            {t("account:PROJECT_EDITOR_HOME_PAGE_BINDINGS_LABEL")}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-caption2 font-medium text-label-secondary">
                            {siteStructure.componentBindings.length}
                          </span>
                        </div>
                        {siteStructure.componentBindings.length ? (
                          <div className="mt-2 grid gap-1">
                            {siteStructure.componentBindings.slice(0, 4).map((binding) => (
                              <div
                                key={`${binding.componentKey}:${binding.bindingKey}`}
                                className="min-w-0 rounded-md border border-border bg-muted/50 px-2 py-1.5"
                              >
                                <div className="flex min-w-0 items-center justify-between gap-2">
                                  <span className="truncate font-medium text-label-primary">
                                    {binding.bindingKey}
                                  </span>
                                  <span className="shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-caption2 text-label-secondary">
                                    {binding.componentKey}
                                  </span>
                                </div>
                                <div className="mt-1 truncate font-mono text-caption2 text-label-tertiary">
                                  {formatComponentBindingPayload(binding) ??
                                    t("account:PROJECT_EDITOR_HOME_PAGE_BINDING_PAYLOAD_EMPTY")}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-footnote text-label-secondary">
                            {t("account:PROJECT_EDITOR_HOME_PAGE_BINDINGS_EMPTY")}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-footnote text-label-secondary">
                      {primarySitePage
                        ? t("account:PROJECT_EDITOR_HOME_PAGE_LOADING")
                        : t("account:PROJECT_EDITOR_HOME_PAGE_EMPTY_DESC")}
                    </p>
                  )}
                </section>

                <div className="mt-3 space-y-1">
                  {visibleContentItems.length ? (
                    visibleContentItems.map((item) => (
                      <div
                        key={item.id}
                        className="min-w-0 rounded-md border border-transparent px-2 py-1.5 text-footnote"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-label-primary">
                              {formatContentItemTitle(item)}
                            </div>
                            <div className="truncate text-caption1 text-label-secondary">
                              {formatContentItemMeta(item) ||
                                t("account:PROJECT_EDITOR_CONTENT_ITEM_META_EMPTY")}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-caption2 font-medium text-label-secondary">
                            {t(contentStatusLabelKey(item))}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-footnote text-label-secondary">
                      {t("account:PROJECT_EDITOR_CONTENT_EMPTY")}
                    </div>
                  )}
                </div>
              </section>

              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-callout font-semibold text-label-primary">
                  <Code2 size={16} />
                  <span>{t("account:PROJECT_EDITOR_SOURCE_TITLE")}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption1 text-label-secondary">
                  <span className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-0.5 text-caption2 font-medium text-label-secondary">
                    {sourceKind
                      ? t(sourceKindTranslationKey(sourceKind, "LABEL"))
                      : t("account:PROJECT_EDITOR_SOURCE_KIND_PENDING")}
                  </span>
                  {sourceQuery.data ? (
                    <span className="inline-flex items-center gap-1">
                      <GitBranch size={12} />
                      {sourceQuery.data.framework}
                    </span>
                  ) : null}
                </div>
                {sourceKind ? (
                  <p className="mt-2 text-caption1 text-label-secondary">
                    {t(sourceKindTranslationKey(sourceKind, "DESC"))}
                  </p>
                ) : null}
                {sourceQuery.data ? (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-caption1">
                    <div className="min-w-0">
                      <dt className="truncate text-label-tertiary">
                        {t("account:SETTINGS_PROJECT_SOURCE_PACKAGE_MANAGER_LABEL")}
                      </dt>
                      <dd className="mt-0.5 truncate font-medium text-label-primary">
                        {sourceQuery.data.packageManager}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="truncate text-label-tertiary">
                        {t("account:SETTINGS_PROJECT_SOURCE_BUILD_COMMAND_LABEL")}
                      </dt>
                      <dd className="mt-0.5 truncate font-medium text-label-primary">
                        {sourceQuery.data.buildCommand}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="truncate text-label-tertiary">
                        {t("account:SETTINGS_PROJECT_SOURCE_OUTPUT_LABEL")}
                      </dt>
                      <dd className="mt-0.5 truncate font-medium text-label-primary">
                        {sourceQuery.data.outputDirectory}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {sourceQuery.data ? (
                  <dl
                    className="mt-3 grid grid-cols-4 gap-2 text-caption1"
                    data-testid="project-editor-source-anatomy"
                  >
                    {[
                      {
                        id: "files",
                        label: t("account:PROJECT_EDITOR_SOURCE_ANATOMY_FILES"),
                        value: sourceFiles.length,
                      },
                      {
                        id: "config",
                        label: t("account:PROJECT_EDITOR_SOURCE_ANATOMY_CONFIG"),
                        value: sourceRoleSummary.config,
                      },
                      {
                        id: "runtime",
                        label: t("account:PROJECT_EDITOR_SOURCE_ANATOMY_RUNTIME"),
                        value: sourceRoleSummary.runtime,
                      },
                      {
                        id: "content",
                        label: t("account:PROJECT_EDITOR_SOURCE_ANATOMY_CONTENT"),
                        value: sourceRoleSummary.content,
                      },
                    ].map((metric) => (
                      <div
                        key={metric.id}
                        className="min-w-0 rounded-md border border-border bg-background px-2 py-2"
                      >
                        <dt className="truncate text-label-tertiary">{metric.label}</dt>
                        <dd className="mt-1 text-callout font-semibold text-label-primary">
                          {metric.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {sourceQuery.data ? (
                  <ProjectEditorRuntimeBindingPanel items={runtimeBindings} t={t} />
                ) : null}
                {sourceProvider === "git" ? (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-caption1 text-label-secondary">
                    {t("account:PROJECT_EDITOR_SOURCE_READONLY_PROVIDER")}
                  </div>
                ) : null}
                {sourceProvider === "managed" ? (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-caption1 text-label-secondary">
                    {t("account:PROJECT_EDITOR_SOURCE_READONLY_NOTICE")}
                  </div>
                ) : null}
              </div>

              <div className="grid min-h-0 flex-1 grid-rows-[220px_minmax(0,1fr)]">
                <div className="overflow-auto border-b border-border p-2">
                  {sourceFiles.length ? (
                    <ProjectEditorSourceTree
                      nodes={sourceTree}
                      onSelectFile={setSelectedSourcePath}
                      selectedPath={selectedSourceFile?.path ?? null}
                    />
                  ) : (
                    <div className="grid h-full place-items-center px-4 text-center text-footnote text-label-secondary">
                      {t("account:PROJECT_EDITOR_SOURCE_EMPTY")}
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-col">
                  <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
                    <div className="min-w-0">
                      <div className="truncate text-footnote font-medium text-label-primary">
                        {selectedSourceFile?.path ?? t("account:PROJECT_EDITOR_SOURCE_NO_FILE")}
                      </div>
                      <div className="truncate text-caption1 text-label-secondary">
                        {formatSourceMeta(selectedSourceFile)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-caption2 font-medium uppercase tracking-normal text-label-secondary">
                      {t("account:PROJECT_EDITOR_SOURCE_READONLY_BADGE")}
                    </span>
                  </div>
                  <pre
                    aria-label={t("account:PROJECT_EDITOR_SOURCE_EDITOR_LABEL")}
                    className={cn(
                      "min-h-0 flex-1 overflow-auto rounded-none border-0 bg-muted/30 p-4",
                      "whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-label-primary",
                    )}
                  >
                    {selectedSourceContents}
                  </pre>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </ContentGuard>
    </DefaultPage>
  );
}
