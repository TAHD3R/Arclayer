import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);
const PRODUCT_SOURCE_ROOT = path.join(REPOSITORY_ROOT, "apps/app/src");
const PRODUCT_TEST_ROOT = path.join(REPOSITORY_ROOT, "apps/app/test");
const THIS_TEST_FILE = fileURLToPath(import.meta.url);
const PRODUCT_LOCAL_LOCALE_ROOT = path.join(REPOSITORY_ROOT, "apps/app/locales");
const ALLOWED_PLATFORM_ENTRY_FILES = new Set([
  "apps/app/src/api/platform-entry.ts",
  "apps/app/src/lib/platform-entry.ts",
]);
const PRODUCT_PLATFORM_MODULE_PATH =
  /\/src\/(?:api|stores|hooks|pages|routes)\/(?:system|platform)(?:[._/-]|$)/;
const FORBIDDEN_PRODUCT_LOCALE_KEY = /(?:^|\.)(?:PLATFORM_|SYS_)/;
const SHARED_PLATFORM_OR_SYSTEM_LOCALE_IMPORT = /@locales\/(?:zh-CN|en-US)\/(?:errors|sys)\.json/;
const PRODUCT_ERROR_RESOURCE_IMPORT = /import\s+(?:zh|en)Errors\s+from\s+["']([^"']+)["']/g;
const PLATFORM_ROUTE_ALIAS =
  /(?:createFileRoute|to|href|redirect|navigate)\s*(?:\(|:|=)?\s*["'`]\/(?:system|platform)(?:\/|["'`?])/;
const PLATFORM_NAVIGATION_TEST_RESIDUE =
  /(?:key|label)\s*:\s*["'`](?:platform(?:[._-][^"'`]*)?|Platform)["'`]/;
const COMPATIBILITY_FACADE =
  /\b(?:LegacyPlatform|PlatformCompatibility|ProductPlatformCompatibility|PlatformFacade|ProductFacade|SystemSettingsLayout|SystemDirectoryShell)\b/;
const REMOVED_AUTHORITY =
  /\b(?:require_super_admin|requireSuperAdmin|is_creator_admin|isCreatorAdmin)\b/;
const ASSIGNABLE_WORKSPACE_OWNER_ROLE =
  /(?:workspace(?:_|-|:)?role|workspaceRole)[\s\S]{0,120}["']owner["']|["']owner["'][\s\S]{0,120}(?:workspace(?:_|-|:)?role|workspaceRole)|["']workspace[:._-]owner["']/i;
const PERSISTED_CONTEXT_AS_CURRENT_SCOPE =
  /currentWorkspaceId\s*\?\?\s*(?:[\w.]+\.)?lastWorkspaceId|currentProjectId\s*\?\?\s*(?:[\w.]+\.)?lastProjectId/;
const LEGACY_NOTIFICATION_NAVIGATION =
  /\b(?:targetTo|targetMeta|normalizeLegacyProjectSettingsPath)\b|legacy-project-settings-paths/;

async function typescriptFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function productSourceFiles(): Promise<readonly string[]> {
  return typescriptFiles(PRODUCT_SOURCE_ROOT);
}

async function productSourceAndTestFiles(): Promise<readonly string[]> {
  const [sourceFiles, testFiles] = await Promise.all([
    typescriptFiles(PRODUCT_SOURCE_ROOT),
    typescriptFiles(PRODUCT_TEST_ROOT),
  ]);
  return [...sourceFiles, ...testFiles].filter((file) => file !== THIS_TEST_FILE);
}

function localeLeafKeys(value: unknown, prefix = ""): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) =>
    localeLeafKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

async function productLocalLocaleFiles(): Promise<
  readonly { file: string; source: string; keys: readonly string[] }[]
> {
  const localeFiles = await Promise.all(
    ["zh-CN", "en-US"].map(async (locale) => {
      const directory = path.join(PRODUCT_LOCAL_LOCALE_ROOT, locale);
      const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
      return Promise.all(
        files.map(async (file) => {
          const source = await readFile(path.join(directory, file), "utf8");
          return {
            file: path.join(directory, file),
            source,
            keys: localeLeafKeys(JSON.parse(source)),
          };
        }),
      );
    }),
  );
  return localeFiles.flat();
}

describe("Wave 0 Product/Platform hard-cut residue", () => {
  it("keeps Platform frontend modules out of the Product Application", async () => {
    const files = await productSourceFiles();
    const residues = files
      .map((file) => path.relative(REPOSITORY_ROOT, file))
      .filter((file) => PRODUCT_PLATFORM_MODULE_PATH.test(file))
      .filter((file) => !ALLOWED_PLATFORM_ENTRY_FILES.has(file));

    expect(residues).toEqual([]);
  });

  it("allows only the authority-free Platform entry client and never imports the Platform app", async () => {
    const [files, packageJson, viteConfig] = await Promise.all([
      productSourceFiles(),
      readFile(path.join(REPOSITORY_ROOT, "apps/app/package.json"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "apps/app/vite.config.ts"), "utf8"),
    ]);
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );
    const joined = sources.map(({ source }) => source).join("\n");

    expect(joined).not.toMatch(/(?:apps\/platform|@arclayer\/platform(?:-openapi)?)/);
    expect(packageJson).not.toMatch(/@arclayer\/platform(?:-openapi)?/);
    expect(viteConfig).not.toMatch(/@arclayer\/platform(?:-openapi)?/);
  });

  it("rejects legacy Platform route aliases, Product locale keys, and compatibility facades", async () => {
    const [files, localeFiles, resourceSource] = await Promise.all([
      productSourceAndTestFiles(),
      productLocalLocaleFiles(),
      readFile(path.join(PRODUCT_SOURCE_ROOT, "lib/i18n/resources.ts"), "utf8"),
    ]);
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );
    const localeResidues = localeFiles
      .filter(({ keys }) => keys.some((key) => FORBIDDEN_PRODUCT_LOCALE_KEY.test(key)))
      .map(({ file }) => path.relative(REPOSITORY_ROOT, file));
    const resourceFile = path.join(PRODUCT_SOURCE_ROOT, "lib/i18n/resources.ts");
    const errorResourceTargets = [...resourceSource.matchAll(PRODUCT_ERROR_RESOURCE_IMPORT)].map(
      ([, importPath]) => path.resolve(path.dirname(resourceFile), importPath),
    );
    const relativePaths = (residues: readonly { file: string; source: string }[]) =>
      residues.map(({ file }) => path.relative(REPOSITORY_ROOT, file));

    expect(
      relativePaths(sources.filter(({ source }) => PLATFORM_ROUTE_ALIAS.test(source))),
    ).toEqual([]);
    expect(
      relativePaths(sources.filter(({ source }) => COMPATIBILITY_FACADE.test(source))),
    ).toEqual([]);
    expect(
      relativePaths(sources.filter(({ source }) => PLATFORM_NAVIGATION_TEST_RESIDUE.test(source))),
    ).toEqual([]);
    expect(resourceSource).not.toMatch(SHARED_PLATFORM_OR_SYSTEM_LOCALE_IMPORT);
    expect(errorResourceTargets).toEqual([
      path.join(PRODUCT_LOCAL_LOCALE_ROOT, "zh-CN/errors.json"),
      path.join(PRODUCT_LOCAL_LOCALE_ROOT, "en-US/errors.json"),
    ]);
    expect(localeResidues).toEqual([]);
  });

  it("rejects removed authority and assignable Workspace Owner role markers", async () => {
    const files = await productSourceFiles();
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );
    const relativePaths = (residues: readonly { file: string; source: string }[]) =>
      residues.map(({ file }) => path.relative(REPOSITORY_ROOT, file));

    expect(relativePaths(sources.filter(({ source }) => REMOVED_AUTHORITY.test(source)))).toEqual(
      [],
    );
    expect(
      relativePaths(sources.filter(({ source }) => ASSIGNABLE_WORKSPACE_OWNER_ROLE.test(source))),
    ).toEqual([]);
  });

  it("keeps persisted Workspace and Project ids out of current request scope", async () => {
    const files = await productSourceFiles();
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );

    expect(
      sources
        .filter(({ source }) => PERSISTED_CONTEXT_AS_CURRENT_SCOPE.test(source))
        .map(({ file }) => path.relative(REPOSITORY_ROOT, file)),
    ).toEqual([]);
  });

  it("rejects legacy Notification route strings and metadata parsers", async () => {
    const files = await productSourceAndTestFiles();
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );

    expect(
      sources
        .filter(({ source }) => LEGACY_NOTIFICATION_NAVIGATION.test(source))
        .map(({ file }) => path.relative(REPOSITORY_ROOT, file)),
    ).toEqual([]);
  });

  it("rejects confirmed Platform language residue in targeted Product surfaces", async () => {
    const [
      agentConceptsSource,
      contentModelsToolbarSource,
      enAccountSource,
      zhAccountSource,
      enContentSource,
      zhContentSource,
      enErrorsSource,
      zhErrorsSource,
    ] = await Promise.all([
      readFile(
        path.join(PRODUCT_SOURCE_ROOT, "pages/projects/editor/style-guide-agent-concepts.tsx"),
        "utf8",
      ),
      readFile(
        path.join(
          PRODUCT_SOURCE_ROOT,
          "pages/projects/content/models/components/content-models-toolbar.tsx",
        ),
        "utf8",
      ),
      readFile(path.join(REPOSITORY_ROOT, "locales/en-US/account.json"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "locales/zh-CN/account.json"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "locales/en-US/content.json"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "locales/zh-CN/content.json"), "utf8"),
      readFile(path.join(PRODUCT_LOCAL_LOCALE_ROOT, "en-US/errors.json"), "utf8"),
      readFile(path.join(PRODUCT_LOCAL_LOCALE_ROOT, "zh-CN/errors.json"), "utf8"),
    ]);
    const enAccount = JSON.parse(enAccountSource) as Record<string, string>;
    const zhAccount = JSON.parse(zhAccountSource) as Record<string, string>;
    const enContent = JSON.parse(enContentSource) as Record<string, string>;
    const zhContent = JSON.parse(zhContentSource) as Record<string, string>;
    const enErrors = JSON.parse(enErrorsSource) as Record<string, string>;
    const zhErrors = JSON.parse(zhErrorsSource) as Record<string, string>;

    expect(agentConceptsSource).toContain('t("account:CREATION_EDITOR_STYLE_AI_AGENT_EMPTY")');
    expect(enAccount.CREATION_EDITOR_STYLE_AI_AGENT_EMPTY).not.toMatch(/\bSystem settings\b/i);
    expect(zhAccount.CREATION_EDITOR_STYLE_AI_AGENT_EMPTY).not.toContain("系统设置");

    expect(contentModelsToolbarSource).not.toMatch(
      /CONTENT_MODELS_(?:CATEGORY_SYSTEM|FILTER_FIELD_MANAGEMENT|FILTER_MANAGED_(?:PLATFORM|CUSTOM))/,
    );
    expect(contentModelsToolbarSource).toMatch(
      /CONTENT_MODELS_(?:CATEGORY_BUILT_IN|FILTER_FIELD_ORIGIN|FILTER_ORIGIN_(?:BUILT_IN|CUSTOM))/,
    );
    expect(enContent).not.toHaveProperty("CONTENT_MODELS_FILTER_MANAGED_PLATFORM");
    expect(zhContent).not.toHaveProperty("CONTENT_MODELS_FILTER_MANAGED_PLATFORM");
    expect(enContent).toMatchObject({
      CONTENT_MODELS_CATEGORY_BUILT_IN: "Built-in",
      CONTENT_MODELS_FILTER_FIELD_ORIGIN: "Origin",
      CONTENT_MODELS_FILTER_ORIGIN_BUILT_IN: "Built-in",
      CONTENT_MODELS_FILTER_ORIGIN_CUSTOM: "Custom",
    });
    expect(zhContent).toMatchObject({
      CONTENT_MODELS_CATEGORY_BUILT_IN: "内置",
      CONTENT_MODELS_FILTER_FIELD_ORIGIN: "来源",
      CONTENT_MODELS_FILTER_ORIGIN_BUILT_IN: "内置",
      CONTENT_MODELS_FILTER_ORIGIN_CUSTOM: "自定义",
    });
    expect(enErrors).toMatchObject({
      AI_MODEL_CATALOG_EMPTY:
        "No chat models are available. Ask an administrator to make an AI model available for this workspace",
      CONTENT_MODEL_DELETE_SYSTEM_MANAGED:
        "Built-in content models are protected and cannot be deleted.",
    });
    expect(zhErrors).toMatchObject({
      AI_MODEL_CATALOG_EMPTY:
        "当前没有可用于对话的模型。请联系管理员为当前工作空间提供可用的 AI 模型",
      CONTENT_MODEL_DELETE_SYSTEM_MANAGED: "内置内容模型受保护，不能删除。",
    });
  });
});
