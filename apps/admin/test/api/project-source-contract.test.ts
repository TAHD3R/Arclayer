import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import {
  deleteProjectSourceFile,
  getProjectSourceFile,
  getProjectSourceManifest,
  upsertProjectSourceFile,
} from "@/api/project-source";
import { api } from "@/lib/http";
import type {
  ProjectSourceFileOut as ProjectSourceFile,
  ProjectSourceFileDeleteOut as ProjectSourceFileDelete,
  ProjectSourceManifestOut as ProjectSourceManifest,
} from "@arclayer/openapi";

describe("api/project source contracts", () => {
  beforeEach(() => {
    vi.mocked(api.delete).mockReset();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
  });

  it("calls the project source manifest endpoint", async () => {
    const manifest: ProjectSourceManifest = {
      artifactStrategy: "object_storage",
      buildCommand: "pnpm build",
      files: [
        {
          contents: "export function App() { return null; }",
          language: "typescriptreact",
          path: "src/App.tsx",
          role: "entry",
        },
      ],
      framework: "react_vite",
      outputDirectory: "dist",
      packageManager: "pnpm",
      projectId: "project-1",
      rootDirectory: ".",
      sourceKind: "generated_scaffold",
      sourceProvider: "managed",
    };
    vi.mocked(api.get).mockResolvedValueOnce(manifest);

    const result = await getProjectSourceManifest("project-1");

    expect(result.files?.[0]?.path).toBe("src/App.tsx");
    expect(api.get).toHaveBeenCalledWith("/projects/project-1/source/manifest");
  });

  it("reads a project source file with encoded path segments", async () => {
    const sourceFile: ProjectSourceFile = {
      contents: "export function App() { return null; }\n",
      language: "typescriptreact",
      path: "src/App shell.tsx",
      role: "entry",
    };
    vi.mocked(api.get).mockResolvedValueOnce(sourceFile);

    const result = await getProjectSourceFile("project-1", "src/App shell.tsx");

    expect(result.contents).toContain("export function App");
    expect(api.get).toHaveBeenCalledWith("/projects/project-1/source/files/src/App%20shell.tsx");
  });

  it("upserts project source files with encoded path segments", async () => {
    const sourceFile: ProjectSourceFile = {
      contents: "export function App() { return null; }\n",
      language: "typescriptreact",
      path: "src/App shell.tsx",
      role: "entry",
    };
    vi.mocked(api.put).mockResolvedValueOnce(sourceFile);

    const result = await upsertProjectSourceFile("project-1", "src/App shell.tsx", {
      contents: sourceFile.contents,
    });

    expect(result.path).toBe("src/App shell.tsx");
    expect(api.put).toHaveBeenCalledWith("/projects/project-1/source/files/src/App%20shell.tsx", {
      contents: "export function App() { return null; }\n",
    });
  });

  it("deletes project source files with encoded path segments", async () => {
    const deleted: ProjectSourceFileDelete = {
      deleted: true,
      path: "src/App shell.tsx",
      projectId: "project-1",
    };
    vi.mocked(api.delete).mockResolvedValueOnce(deleted);

    const result = await deleteProjectSourceFile("project-1", "src/App shell.tsx");

    expect(result.deleted).toBe(true);
    expect(api.delete).toHaveBeenCalledWith("/projects/project-1/source/files/src/App%20shell.tsx");
  });
});
