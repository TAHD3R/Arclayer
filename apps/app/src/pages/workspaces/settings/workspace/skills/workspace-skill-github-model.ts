import { z } from "zod";

import type { SkillGitHubImportCreateRequest } from "@arclayer/openapi";

function isPublicGitHubRepository(value: string): boolean {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "github.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      parts.length === 2
    );
  } catch {
    return false;
  }
}

export const githubSkillImportSchema = z.object({
  repositoryUrl: z.string().trim().refine(isPublicGitHubRepository),
});

export type GitHubSkillImportValues = z.infer<typeof githubSkillImportSchema>;

export const githubSkillImportDefaults: GitHubSkillImportValues = {
  repositoryUrl: "",
};

export function toGitHubSkillImportPayload(
  values: GitHubSkillImportValues,
): SkillGitHubImportCreateRequest {
  return {
    repositoryUrl: values.repositoryUrl.trim(),
  };
}
