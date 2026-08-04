import { z } from "zod";

import type {
  SkillPackageDetailOut,
  SkillVersionCreateRequest,
  SkillVersionDetailOut,
} from "@arclayer/openapi";

const stableIdentifier = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function deriveSkillSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const skillAuthoringSchema = z.object({
  displayName: z.string().trim().min(1),
  slug: z.string().trim().regex(slugPattern),
  description: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  semanticVersion: z.string().trim(),
  capabilityTags: z.string(),
  references: z.array(
    z.object({
      path: z
        .string()
        .trim()
        .min(1)
        .refine((value) => value !== "SKILL.md" && !value.includes("..")),
      content: z.string().min(1),
    }),
  ),
  requiredTools: z.array(
    z.object({
      toolId: z.string().trim().regex(stableIdentifier),
      versionRange: z.string().trim().min(1),
      intendedUse: z.string().trim().min(1),
    }),
  ),
  permissions: z.array(
    z.object({
      action: z.string().trim().regex(stableIdentifier),
      purpose: z.string().trim().min(1),
    }),
  ),
  dataEgress: z.array(
    z.object({
      destination: z.string().trim().min(1),
      purpose: z.string().trim().min(1),
      dataClasses: z.string().trim().min(1),
    }),
  ),
});

export type SkillAuthoringValues = z.infer<typeof skillAuthoringSchema>;

function splitIdentifiers(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function skillAuthoringDefaults(
  skillPackage?: SkillPackageDetailOut,
  sourceVersion?: SkillVersionDetailOut,
): SkillAuthoringValues {
  const manifest = sourceVersion?.manifest;
  return {
    displayName: skillPackage?.displayName ?? "",
    slug: skillPackage?.slug ?? "",
    description: skillPackage?.description ?? "",
    instructions:
      sourceVersion?.resources.find((resource) => resource.path === "SKILL.md")?.content ?? "",
    semanticVersion: sourceVersion?.semanticVersion ?? "",
    capabilityTags: manifest?.capabilityTags?.join(", ") ?? "",
    references:
      sourceVersion?.resources
        .filter((resource) => resource.role === "reference" && resource.content)
        .map((resource) => ({ path: resource.path, content: resource.content ?? "" })) ?? [],
    requiredTools:
      manifest?.requiredTools?.map((tool) => ({
        toolId: tool.toolId,
        versionRange: tool.versionRange ?? ">=1",
        intendedUse: tool.intendedUse,
      })) ?? [],
    permissions:
      manifest?.permissions?.map((permission) => ({
        action: permission.action,
        purpose: permission.purpose,
      })) ?? [],
    dataEgress:
      manifest?.dataEgress?.map((egress) => ({
        destination: egress.destination,
        purpose: egress.purpose,
        dataClasses: egress.dataClasses.join(", "),
      })) ?? [],
  };
}

export function toSkillVersionPayload(values: SkillAuthoringValues): SkillVersionCreateRequest {
  return {
    instructions: values.instructions.trim(),
    semanticVersion: values.semanticVersion.trim() || null,
    capabilityTags: splitIdentifiers(values.capabilityTags),
    references: values.references.map((reference) => ({
      path: reference.path.trim(),
      content: reference.content,
      mimeType: "text/markdown",
    })),
    requiredTools: values.requiredTools.map((tool) => ({
      toolId: tool.toolId.trim(),
      versionRange: tool.versionRange.trim(),
      intendedUse: tool.intendedUse.trim(),
    })),
    permissions: values.permissions.map((permission) => ({
      action: permission.action.trim(),
      purpose: permission.purpose.trim(),
    })),
    dataEgress: values.dataEgress.map((egress) => ({
      destination: egress.destination.trim(),
      purpose: egress.purpose.trim(),
      dataClasses: splitIdentifiers(egress.dataClasses),
    })),
  };
}
