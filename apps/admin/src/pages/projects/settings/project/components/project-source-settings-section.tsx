import { useTranslation } from "react-i18next";

import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
} from "@/components/settings/setting-item";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export const DEFAULT_PROJECT_SOURCE_SETTINGS: ProjectSourceSettingsDraft = {
  framework: "react_vite",
  sourceProvider: "managed",
  packageManager: "pnpm",
  rootDirectory: ".",
  buildCommand: "pnpm build",
  outputDirectory: "dist",
  artifactStrategy: "object_storage",
};

type ProjectSourceFramework = "react_vite" | "astro";
type ProjectSourceProvider = "managed" | "git";
type ProjectPackageManager = "pnpm" | "npm";
type ProjectArtifactStrategy = "object_storage" | "container_image";
type ProjectSourceWorkflowState = "limited" | "ready";

export type ProjectSourceSettingsDraft = {
  framework: ProjectSourceFramework;
  sourceProvider: ProjectSourceProvider;
  packageManager: ProjectPackageManager;
  rootDirectory: string;
  buildCommand: string;
  outputDirectory: string;
  artifactStrategy: ProjectArtifactStrategy;
};

type ProjectSourceRuntimeBindingItem = {
  descriptionKey: string;
  id: string;
  titleKey: string;
};

const PROJECT_SOURCE_FILE_BLUEPRINTS: Record<ProjectSourceFramework, readonly string[]> = {
  react_vite: [
    "package.json",
    "index.html",
    "vite.config.ts",
    "src/main.tsx",
    "src/App.tsx",
    "src/arclayer/runtime.ts",
    "src/arclayer/site-config.ts",
    "src/arclayer/content.ts",
  ],
  astro: [
    "package.json",
    "astro.config.mjs",
    "src/pages/index.astro",
    "src/layouts/BaseLayout.astro",
    "src/components/ReactIsland.tsx",
    "src/styles/global.css",
    "src/arclayer/runtime.ts",
    "src/arclayer/site-config.ts",
    "src/arclayer/content.ts",
  ],
};

const PROJECT_SOURCE_RUNTIME_BINDINGS: readonly ProjectSourceRuntimeBindingItem[] = [
  {
    descriptionKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_SETTINGS_DESC",
    id: "settings",
    titleKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_SETTINGS_TITLE",
  },
  {
    descriptionKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_CONTENT_DESC",
    id: "content",
    titleKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_CONTENT_TITLE",
  },
  {
    descriptionKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_SOURCE_DESC",
    id: "source",
    titleKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_SOURCE_TITLE",
  },
  {
    descriptionKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_RELEASE_DESC",
    id: "release",
    titleKey: "SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_RELEASE_TITLE",
  },
];

const PROJECT_SOURCE_FRAMEWORK_EVALUATION: Record<
  ProjectSourceFramework,
  {
    summaryKey: string;
    fitKeys: readonly string[];
    statusKey: string;
  }
> = {
  react_vite: {
    summaryKey: "SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_SUMMARY",
    fitKeys: [
      "SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_FIT_VISUAL",
      "SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_FIT_AI",
      "SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE_FIT_RUNTIME",
    ],
    statusKey: "SETTINGS_PROJECT_SOURCE_FRAMEWORK_STATUS_RECOMMENDED",
  },
  astro: {
    summaryKey: "SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO_SUMMARY",
    fitKeys: [
      "SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO_FIT_CONTENT",
      "SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO_FIT_ISLANDS",
      "SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO_FIT_LIMIT",
    ],
    statusKey: "SETTINGS_PROJECT_SOURCE_FRAMEWORK_STATUS_SUPPORTED",
  },
};

function ProjectSourceFieldMessage(props: { message: string | null }) {
  if (!props.message) return null;
  return <div className="text-footnote text-destructive">{props.message}</div>;
}

function ProjectSourceFrameworkEvaluationPanel(props: {
  framework: ProjectSourceFramework;
  t: (key: string) => string;
}) {
  const evaluation = PROJECT_SOURCE_FRAMEWORK_EVALUATION[props.framework];

  return (
    <div
      className="rounded-md border border-border bg-muted/20 px-4 py-3"
      data-testid="project-source-framework-evaluation"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-headline text-label-primary">
            {props.t("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_EVALUATION_TITLE")}
          </div>
          <div className="mt-1 text-footnote text-label-secondary">
            {props.t(`account:${evaluation.summaryKey}`)}
          </div>
        </div>
        <span className="shrink-0 rounded-sm border border-border bg-background px-2 py-1 text-caption font-medium text-label-secondary">
          {props.t(`account:${evaluation.statusKey}`)}
        </span>
      </div>
      <ul className="mt-3 grid gap-2 text-footnote text-label-secondary md:grid-cols-3">
        {evaluation.fitKeys.map((key) => (
          <li key={key} className="rounded-sm border border-border bg-background px-3 py-2">
            {props.t(`account:${key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectSourceProviderModePanel(props: {
  sourceProvider: ProjectSourceProvider;
  t: (key: string) => string;
}) {
  const state =
    props.sourceProvider === "git"
      ? {
          descriptionKey: "SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_GIT_DESC",
          labelKey: "SETTINGS_PROJECT_SOURCE_PROVIDER_GIT",
          titleKey: "SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_GIT_TITLE",
        }
      : {
          descriptionKey: "SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_MANAGED_DESC",
          labelKey: "SETTINGS_PROJECT_SOURCE_PROVIDER_MANAGED",
          titleKey: "SETTINGS_PROJECT_SOURCE_PROVIDER_MODE_MANAGED_TITLE",
        };

  return (
    <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-headline text-label-primary">
            {props.t(`account:${state.titleKey}`)}
          </div>
          <div className="mt-1 text-footnote text-label-secondary">
            {props.t(`account:${state.descriptionKey}`)}
          </div>
        </div>
        <span className="shrink-0 rounded-sm border border-border bg-background px-2 py-1 text-caption font-medium text-label-secondary">
          {props.t(`account:${state.labelKey}`)}
        </span>
      </div>
    </div>
  );
}

function ProjectSourceRuntimeBindingPanel(props: { t: (key: string) => string }) {
  return (
    <div
      className="rounded-md border border-border bg-muted/20 px-4 py-3"
      data-testid="project-source-runtime-binding"
    >
      <div className="text-headline text-label-primary">
        {props.t("account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_TITLE")}
      </div>
      <div className="mt-1 text-footnote text-label-secondary">
        {props.t("account:SETTINGS_PROJECT_SOURCE_RUNTIME_BINDING_DESC")}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {PROJECT_SOURCE_RUNTIME_BINDINGS.map((item) => (
          <div key={item.id} className="rounded-sm border border-border bg-background px-3 py-2">
            <div className="text-caption font-semibold text-label-primary">
              {props.t(`account:${item.titleKey}`)}
            </div>
            <div className="mt-1 text-footnote text-label-secondary">
              {props.t(`account:${item.descriptionKey}`)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectSourceWorkflowContractPanel(props: {
  artifactStrategy: ProjectArtifactStrategy;
  sourceProvider: ProjectSourceProvider;
  t: (key: string) => string;
}) {
  const sourceCrudState: ProjectSourceWorkflowState =
    props.sourceProvider === "managed" ? "ready" : "limited";
  const releaseState: ProjectSourceWorkflowState =
    props.artifactStrategy === "object_storage" ? "ready" : "limited";
  const items: Array<{
    descriptionKey: string;
    id: string;
    state: ProjectSourceWorkflowState;
    titleKey: string;
  }> = [
    {
      descriptionKey: "SETTINGS_PROJECT_SOURCE_WORKFLOW_PREVIEW_DESC",
      id: "preview",
      state: "ready",
      titleKey: "SETTINGS_PROJECT_SOURCE_WORKFLOW_PREVIEW_TITLE",
    },
    {
      descriptionKey:
        props.sourceProvider === "managed"
          ? "SETTINGS_PROJECT_SOURCE_WORKFLOW_SOURCE_CRUD_READY_DESC"
          : "SETTINGS_PROJECT_SOURCE_WORKFLOW_SOURCE_CRUD_LIMITED_DESC",
      id: "source-crud",
      state: sourceCrudState,
      titleKey: "SETTINGS_PROJECT_SOURCE_WORKFLOW_SOURCE_CRUD_TITLE",
    },
    {
      descriptionKey: "SETTINGS_PROJECT_SOURCE_WORKFLOW_CONTENT_RUNTIME_DESC",
      id: "content-runtime",
      state: "ready",
      titleKey: "SETTINGS_PROJECT_SOURCE_WORKFLOW_CONTENT_RUNTIME_TITLE",
    },
    {
      descriptionKey:
        props.artifactStrategy === "object_storage"
          ? "SETTINGS_PROJECT_SOURCE_WORKFLOW_RELEASE_READY_DESC"
          : "SETTINGS_PROJECT_SOURCE_WORKFLOW_RELEASE_LIMITED_DESC",
      id: "release",
      state: releaseState,
      titleKey: "SETTINGS_PROJECT_SOURCE_WORKFLOW_RELEASE_TITLE",
    },
  ];

  return (
    <div
      className="rounded-md border border-border bg-muted/20 px-4 py-3"
      data-testid="project-source-workflow-contract"
    >
      <div className="text-headline text-label-primary">
        {props.t("account:SETTINGS_PROJECT_SOURCE_WORKFLOW_TITLE")}
      </div>
      <div className="mt-1 text-footnote text-label-secondary">
        {props.t("account:SETTINGS_PROJECT_SOURCE_WORKFLOW_DESC")}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-sm border border-border bg-background px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-caption font-semibold text-label-primary">
                {props.t(`account:${item.titleKey}`)}
              </div>
              <span
                className={
                  item.state === "ready"
                    ? "shrink-0 rounded-sm border border-positive/30 bg-positive/5 px-2 py-0.5 text-caption font-medium text-positive"
                    : "shrink-0 rounded-sm border border-warning/30 bg-warning/5 px-2 py-0.5 text-caption font-medium text-warning"
                }
              >
                {props.t(
                  item.state === "ready"
                    ? "account:SETTINGS_PROJECT_SOURCE_WORKFLOW_STATE_READY"
                    : "account:SETTINGS_PROJECT_SOURCE_WORKFLOW_STATE_LIMITED",
                )}
              </span>
            </div>
            <div className="mt-1 text-footnote text-label-secondary">
              {props.t(`account:${item.descriptionKey}`)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickSettingsString(value: unknown, path: readonly string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

export function parseProjectSourceSettings(input: unknown): ProjectSourceSettingsDraft {
  const value =
    input && typeof input === "object" && "value" in input
      ? (input as { value?: unknown }).value
      : undefined;
  const section = value && typeof value === "object" ? value : undefined;
  const framework = pickSettingsString(section, ["project_source", "framework"]);
  const sourceProvider = pickSettingsString(section, ["project_source", "source_provider"]);
  const packageManager = pickSettingsString(section, ["project_source", "package_manager"]);
  const artifactStrategy = pickSettingsString(section, ["project_source", "artifact_strategy"]);
  return {
    framework: framework === "astro" ? "astro" : "react_vite",
    sourceProvider: sourceProvider === "git" ? "git" : "managed",
    packageManager: packageManager === "npm" ? "npm" : "pnpm",
    rootDirectory:
      pickSettingsString(section, ["project_source", "root_directory"]) ??
      DEFAULT_PROJECT_SOURCE_SETTINGS.rootDirectory,
    buildCommand:
      pickSettingsString(section, ["project_source", "build_command"]) ??
      DEFAULT_PROJECT_SOURCE_SETTINGS.buildCommand,
    outputDirectory:
      pickSettingsString(section, ["project_source", "output_directory"]) ??
      DEFAULT_PROJECT_SOURCE_SETTINGS.outputDirectory,
    artifactStrategy: artifactStrategy === "container_image" ? "container_image" : "object_storage",
  };
}

export function buildProjectSourcePatch(
  draft: ProjectSourceSettingsDraft,
): Record<string, JsonValueInput> {
  return {
    project_source: {
      framework: draft.framework,
      source_provider: draft.sourceProvider,
      package_manager: draft.packageManager,
      root_directory: draft.rootDirectory.trim(),
      build_command: draft.buildCommand.trim(),
      output_directory: draft.outputDirectory.trim(),
      artifact_strategy: draft.artifactStrategy,
    },
  };
}

function isUnsafeRelativeDirectory(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("/") || trimmed.split(/[\\/]+/).includes("..");
}

export function validateProjectSourceSettings(
  draft: ProjectSourceSettingsDraft,
  t: (key: string) => string,
): string | null {
  if (!draft.rootDirectory.trim()) {
    return t("account:SETTINGS_PROJECT_SOURCE_ROOT_REQUIRED");
  }
  if (isUnsafeRelativeDirectory(draft.rootDirectory)) {
    return t("account:SETTINGS_PROJECT_SOURCE_DIRECTORY_UNSAFE");
  }
  if (!draft.outputDirectory.trim()) {
    return t("account:SETTINGS_PROJECT_SOURCE_OUTPUT_REQUIRED");
  }
  if (isUnsafeRelativeDirectory(draft.outputDirectory)) {
    return t("account:SETTINGS_PROJECT_SOURCE_DIRECTORY_UNSAFE");
  }
  if (!draft.buildCommand.trim()) {
    return t("account:SETTINGS_PROJECT_SOURCE_BUILD_COMMAND_REQUIRED");
  }
  return null;
}

export function ProjectSourceSettingsSection(props: {
  draft: ProjectSourceSettingsDraft;
  initial: ProjectSourceSettingsDraft;
  disabled: boolean;
  pending: boolean;
  error: string | null;
  onChange: (patch: Partial<ProjectSourceSettingsDraft>) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation(["account", "settings"]);
  const dirty = JSON.stringify(props.draft) !== JSON.stringify(props.initial);
  const files = PROJECT_SOURCE_FILE_BLUEPRINTS[props.draft.framework];

  return (
    <SystemSettingItem
      id="project-source"
      title={t("account:SETTINGS_PROJECT_SOURCE_TITLE")}
      description={t("account:SETTINGS_PROJECT_SOURCE_DESC")}
      footer={
        <SystemSettingFooterActions
          dirty={dirty}
          pending={props.pending}
          onReset={props.onReset}
          onSave={props.onSave}
        />
      }
    >
      <div className="grid gap-4">
        {props.error ? <ProjectSourceFieldMessage message={props.error} /> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <SystemSettingField
            label={t("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_LABEL")}
            description={t("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_DESC")}
          >
            <Select
              value={props.draft.framework}
              disabled={props.disabled}
              onValueChange={(value) => {
                const framework = value === "astro" ? "astro" : "react_vite";
                props.onChange({
                  framework,
                  buildCommand:
                    framework === "astro" && props.draft.buildCommand === "pnpm build"
                      ? "pnpm build"
                      : props.draft.buildCommand,
                  outputDirectory:
                    framework === "astro" && props.draft.outputDirectory === "dist"
                      ? "dist"
                      : props.draft.outputDirectory,
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="react_vite">
                  {t("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_REACT_VITE")}
                </SelectItem>
                <SelectItem value="astro">
                  {t("account:SETTINGS_PROJECT_SOURCE_FRAMEWORK_ASTRO")}
                </SelectItem>
              </SelectContent>
            </Select>
          </SystemSettingField>

          <SystemSettingField
            label={t("account:SETTINGS_PROJECT_SOURCE_PROVIDER_LABEL")}
            description={t("account:SETTINGS_PROJECT_SOURCE_PROVIDER_DESC")}
          >
            <Select
              value={props.draft.sourceProvider}
              disabled={props.disabled}
              onValueChange={(value) =>
                props.onChange({ sourceProvider: value === "git" ? "git" : "managed" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="managed">
                  {t("account:SETTINGS_PROJECT_SOURCE_PROVIDER_MANAGED")}
                </SelectItem>
                <SelectItem value="git">
                  {t("account:SETTINGS_PROJECT_SOURCE_PROVIDER_GIT")}
                </SelectItem>
              </SelectContent>
            </Select>
          </SystemSettingField>

          <SystemSettingField
            label={t("account:SETTINGS_PROJECT_SOURCE_PACKAGE_MANAGER_LABEL")}
            description={t("account:SETTINGS_PROJECT_SOURCE_PACKAGE_MANAGER_DESC")}
          >
            <Select
              value={props.draft.packageManager}
              disabled={props.disabled}
              onValueChange={(value) =>
                props.onChange({ packageManager: value === "npm" ? "npm" : "pnpm" })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pnpm">pnpm</SelectItem>
                <SelectItem value="npm">npm</SelectItem>
              </SelectContent>
            </Select>
          </SystemSettingField>

          <SystemSettingField
            label={t("account:SETTINGS_PROJECT_SOURCE_ARTIFACT_LABEL")}
            description={t("account:SETTINGS_PROJECT_SOURCE_ARTIFACT_DESC")}
          >
            <Select
              value={props.draft.artifactStrategy}
              disabled={props.disabled}
              onValueChange={(value) =>
                props.onChange({
                  artifactStrategy:
                    value === "container_image" ? "container_image" : "object_storage",
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="object_storage">
                  {t("account:SETTINGS_PROJECT_SOURCE_ARTIFACT_OBJECT_STORAGE")}
                </SelectItem>
                <SelectItem value="container_image">
                  {t("account:SETTINGS_PROJECT_SOURCE_ARTIFACT_CONTAINER")}
                </SelectItem>
              </SelectContent>
            </Select>
          </SystemSettingField>

          <SystemSettingField
            label={t("account:SETTINGS_PROJECT_SOURCE_ROOT_LABEL")}
            description={t("account:SETTINGS_PROJECT_SOURCE_ROOT_DESC")}
          >
            <Input
              value={props.draft.rootDirectory}
              disabled={props.disabled}
              onChange={(event) => props.onChange({ rootDirectory: event.target.value })}
              autoComplete="off"
            />
          </SystemSettingField>

          <SystemSettingField
            label={t("account:SETTINGS_PROJECT_SOURCE_OUTPUT_LABEL")}
            description={t("account:SETTINGS_PROJECT_SOURCE_OUTPUT_DESC")}
          >
            <Input
              value={props.draft.outputDirectory}
              disabled={props.disabled}
              onChange={(event) => props.onChange({ outputDirectory: event.target.value })}
              autoComplete="off"
            />
          </SystemSettingField>
        </div>

        <SystemSettingField
          label={t("account:SETTINGS_PROJECT_SOURCE_BUILD_COMMAND_LABEL")}
          description={t("account:SETTINGS_PROJECT_SOURCE_BUILD_COMMAND_DESC")}
        >
          <Input
            value={props.draft.buildCommand}
            disabled={props.disabled}
            onChange={(event) => props.onChange({ buildCommand: event.target.value })}
            autoComplete="off"
          />
        </SystemSettingField>

        <ProjectSourceFrameworkEvaluationPanel framework={props.draft.framework} t={t} />
        <ProjectSourceProviderModePanel sourceProvider={props.draft.sourceProvider} t={t} />
        <ProjectSourceRuntimeBindingPanel t={t} />
        <ProjectSourceWorkflowContractPanel
          artifactStrategy={props.draft.artifactStrategy}
          sourceProvider={props.draft.sourceProvider}
          t={t}
        />

        <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
          <div className="text-headline text-label-primary">
            {t("account:SETTINGS_PROJECT_SOURCE_FILES_TITLE")}
          </div>
          <div className="mt-1 text-footnote text-label-secondary">
            {t("account:SETTINGS_PROJECT_SOURCE_FILES_DESC")}
          </div>
          <div className="mt-3 grid gap-1 font-mono text-caption text-label-secondary sm:grid-cols-2">
            {files.map((file) => (
              <div key={file} className="truncate">
                {file}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SystemSettingItem>
  );
}
