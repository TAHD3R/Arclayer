import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(REPOSITORY_ROOT, relativePath), "utf8");
}

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];

  return Object.entries(value).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe("Platform application foundation", () => {
  it("registers the independent Platform application in workspace and root gates", async () => {
    const [workspace, rootPackage, turboConfig] = await Promise.all([
      readRepositoryFile("pnpm-workspace.yaml"),
      readRepositoryFile("package.json"),
      readRepositoryFile("turbo.json"),
    ]);

    expect(workspace).toContain("- apps/platform");

    const scripts = (JSON.parse(rootPackage) as { scripts: Record<string, string> }).scripts;
    expect(scripts.platform).toContain("@arclayer/platform");
    expect(scripts["platform:build"]).toContain("@arclayer/platform");
    expect(scripts["platform:check"]).toContain("@arclayer/platform");
    expect(scripts["platform:check"]).toContain("build");
    expect(scripts["platform:check"]).toContain("locale:check");
    expect(scripts.check).toContain("@arclayer/platform");

    const tasks = (JSON.parse(turboConfig) as { tasks: Record<string, unknown> }).tasks;
    expect(tasks).toHaveProperty("locale:check");
  });

  it("declares an independent local Platform host and build target", async () => {
    const [environment, traefik] = await Promise.all([
      readRepositoryFile(".env.example"),
      readRepositoryFile("docker/traefik/dynamic.yml"),
    ]);

    expect(environment).toContain("ARCLAYER_PLATFORM_URL=https://platform.arclayer.localhost");
    expect(traefik).toContain("Host(`platform.arclayer.localhost`)");
    expect(traefik).toContain('url: "http://host.docker.internal:5174"');
  });

  it("serves its own Platform favicon without depending on Product Application assets", async () => {
    const [document, favicon] = await Promise.all([
      readRepositoryFile("apps/platform/index.html"),
      readRepositoryFile("apps/platform/public/logo.svg"),
    ]);

    expect(document).toContain('<link rel="icon" type="image/svg+xml" href="/logo.svg" />');
    expect(favicon).toContain("Arclayer Arc Weave");
  });

  it("keeps the shared UI token system as the only visual-token authority", async () => {
    const stylesheet = await readRepositoryFile("apps/platform/src/index.css");
    const document = await readRepositoryFile("apps/platform/index.html");

    expect(stylesheet).toContain('@import "@arclayer/ui/tokens.css" layer(theme)');
    expect(stylesheet).toContain('@custom-variant dark (&:is([data-theme="dark"] *))');
    expect(stylesheet).not.toContain(":root {");
    expect(stylesheet).not.toContain(".dark {");
    expect(stylesheet).not.toContain("@theme inline");

    expect(document).toContain("document.documentElement.dataset.theme = resolvedTheme");
    expect(document).toContain('html[data-theme="dark"] #app-loading');
    expect(document).not.toContain('classList.toggle("dark"');
  });

  it("ships an independent Platform locale tree with exact key parity", async () => {
    const localeRoot = path.join(REPOSITORY_ROOT, "apps/platform/locales");
    const [chineseFiles, englishFiles] = await Promise.all([
      readdir(path.join(localeRoot, "zh-CN")),
      readdir(path.join(localeRoot, "en-US")),
    ]);

    expect(chineseFiles.sort()).toEqual(englishFiles.sort());

    for (const file of chineseFiles) {
      const [chinese, english] = await Promise.all([
        readFile(path.join(localeRoot, "zh-CN", file), "utf8"),
        readFile(path.join(localeRoot, "en-US", file), "utf8"),
      ]);
      expect(flattenKeys(JSON.parse(chinese)).sort(), file).toEqual(
        flattenKeys(JSON.parse(english)).sort(),
      );
    }
  });

  it("owns an unprefixed route tree without importing Product Application source", async () => {
    const sourceRoot = path.join(REPOSITORY_ROOT, "apps/platform/src");
    const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
    const sourceFiles = entries
      .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name));
    const sources = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));

    expect(await readRepositoryFile("apps/platform/src/routes/_authenticated/index.tsx")).toContain(
      'createFileRoute("/_authenticated/")',
    );
    expect(sources.join("\n")).not.toMatch(/createFileRoute\(["']\/(?:system|platform)/);
    expect(sources.join("\n")).not.toMatch(/apps\/admin|@arclayer\/admin/);
  });
});
