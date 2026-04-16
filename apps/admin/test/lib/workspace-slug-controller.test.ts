import { describe, expect, it } from "vitest";

import {
  adoptNameSeedWorkspaceSlug,
  applyManualWorkspaceSlugInput,
  buildWorkspaceSlug,
  createNameSeedWorkspaceSlugState,
  createProfileSeedWorkspaceSlugState,
  syncWorkspaceSlugWithName,
} from "@/lib/workspace-slug";

describe("workspace slug controller", () => {
  it("builds an ASCII slug from English names", () => {
    expect(buildWorkspaceSlug("Admin's Workspace")).toBe("admins-workspace");
    expect(buildWorkspaceSlug("  Product Studio  ")).toBe("product-studio");
  });

  it("builds a deterministic slug from Chinese and mixed-language names", () => {
    expect(buildWorkspaceSlug("中文工作空间")).toBe("zhong-wen-gong-zuo-kong-jian");
    expect(buildWorkspaceSlug("李雷的AI工作室")).toBe("li-lei-de-ai-gong-zuo-shi");
    expect(buildWorkspaceSlug("上海设计团队")).toBe("shang-hai-she-ji-tuan-dui");
  });

  it("keeps a profile-seeded slug stable when the workspace name changes", () => {
    const initial = createProfileSeedWorkspaceSlugState("admin");

    expect(syncWorkspaceSlugWithName(initial, "Admin's Workspace")).toEqual({
      value: "admin",
      source: "profile-seed",
    });
  });

  it("keeps a name-seeded slug synced until the user edits slug manually", () => {
    const initial = createNameSeedWorkspaceSlugState("Studio Team");
    expect(initial).toEqual({
      value: "studio-team",
      source: "name-seed",
    });

    const synced = syncWorkspaceSlugWithName(initial, "Studio Team Pro");
    expect(synced).toEqual({
      value: "studio-team-pro",
      source: "name-seed",
    });

    const manual = applyManualWorkspaceSlugInput("founder-team");
    expect(manual).toEqual({
      value: "founder-team",
      source: "manual",
    });

    expect(syncWorkspaceSlugWithName(manual, "Studio Team Prime")).toEqual(manual);
  });

  it("allows onboarding to switch from empty name seed to auto-derived name seed", () => {
    expect(adoptNameSeedWorkspaceSlug("Founder 的工作区")).toEqual({
      value: "founder-de-gong-zuo-qu",
      source: "name-seed",
    });
  });

  it("normalizes manual Chinese slug input instead of leaving it empty", () => {
    expect(applyManualWorkspaceSlugInput("你好 世界")).toEqual({
      value: "ni-hao-shi-jie",
      source: "manual",
    });
  });

  it("preserves a trailing hyphen during manual typing so users can keep typing segmented slugs", () => {
    expect(applyManualWorkspaceSlugInput("custom-")).toEqual({
      value: "custom-",
      source: "manual",
    });
  });
});
