import { z } from "zod";

import type { SkillGitHubImportCreateRequest } from "@arclayer/openapi";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  requestedRef: z.string().trim().min(1),
  subpath: z
    .string()
    .trim()
    .refine((value) => !value.includes("..") && !value.includes("\\")),
  slug: z.string().trim().regex(slugPattern),
  displayName: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

export type GitHubSkillImportValues = z.infer<typeof githubSkillImportSchema>;

export const githubSkillImportDefaults: GitHubSkillImportValues = {
  repositoryUrl: "",
  requestedRef: "main",
  subpath: "",
  slug: "",
  displayName: "",
  description: "",
};

export function deriveGitHubSkillIdentity(repositoryUrl: string): {
  slug: string;
  displayName: string;
} | null {
  if (!isPublicGitHubRepository(repositoryUrl.trim())) return null;
  const repository = new URL(repositoryUrl.trim()).pathname.split("/").filter(Boolean)[1];
  const name = repository.replace(/\.git$/i, "");
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) return null;
  const displayName = name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return { slug, displayName };
}

export function toGitHubSkillImportPayload(
  values: GitHubSkillImportValues,
): SkillGitHubImportCreateRequest {
  return {
    repositoryUrl: values.repositoryUrl.trim(),
    requestedRef: values.requestedRef.trim(),
    subpath: values.subpath.trim().replace(/^\/+|\/+$/g, ""),
    slug: values.slug.trim(),
    displayName: values.displayName.trim(),
    description: values.description.trim(),
  };
}
