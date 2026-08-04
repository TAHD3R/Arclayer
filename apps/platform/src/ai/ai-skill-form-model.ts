import type {
  PlatformSkillPackageCreateRequest,
  PlatformSkillPackageDetailOut,
  PlatformSkillPackageReplaceRequest,
  PlatformSkillVersionCreateRequest,
  PlatformSkillVersionOut,
  SkillDataEgressDeclarationV1,
  SkillInlineReferenceInput,
  SkillPermissionDeclarationV1,
  SkillToolRequirementV1,
} from "@arclayer/platform-openapi";

export type PlatformSkillVersionFormValues = Readonly<{
  semanticVersion: string;
  instructions: string;
  capabilityTags: string;
  requiredTools: SkillToolRequirementV1[];
  permissions: SkillPermissionDeclarationV1[];
  dataEgress: SkillDataEgressDeclarationV1[];
  references: SkillInlineReferenceInput[];
}>;

export type PlatformSkillCreateFormValues = PlatformSkillVersionFormValues &
  Readonly<{
    displayName: string;
    slug: string;
    description: string;
  }>;

export const EMPTY_PLATFORM_SKILL_CREATE_VALUES: PlatformSkillCreateFormValues = {
  displayName: "",
  slug: "",
  description: "",
  semanticVersion: "",
  instructions: "",
  capabilityTags: "",
  requiredTools: [],
  permissions: [],
  dataEgress: [],
  references: [],
};

export class PlatformSkillFormError extends Error {
  constructor(readonly field: keyof PlatformSkillCreateFormValues) {
    super(field);
    this.name = "PlatformSkillFormError";
  }
}

function requireText(value: unknown, field: keyof PlatformSkillCreateFormValues): string {
  if (typeof value !== "string" || !value.trim()) throw new PlatformSkillFormError(field);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireValues(
  values: readonly string[],
  field: keyof PlatformSkillCreateFormValues,
): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) throw new PlatformSkillFormError(field);
  return [...new Set(normalized)];
}

function normalizedVersionPayload(
  values: PlatformSkillVersionFormValues,
): PlatformSkillVersionCreateRequest {
  return {
    instructions: requireText(values.instructions, "instructions"),
    semanticVersion: optionalText(values.semanticVersion) ?? null,
    capabilityTags: [
      ...new Set(
        values.capabilityTags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ],
    requiredTools: values.requiredTools.map((item) => {
      const versionRange = optionalText(item.versionRange);
      return {
        toolId: requireText(item.toolId, "requiredTools"),
        intendedUse: requireText(item.intendedUse, "requiredTools"),
        ...(versionRange ? { versionRange } : {}),
      };
    }),
    permissions: values.permissions.map((item) => ({
      action: requireText(item.action, "permissions"),
      purpose: requireText(item.purpose, "permissions"),
    })),
    dataEgress: values.dataEgress.map((item) => ({
      destination: requireText(item.destination, "dataEgress"),
      purpose: requireText(item.purpose, "dataEgress"),
      dataClasses: requireValues(item.dataClasses, "dataEgress"),
    })),
    references: values.references.map((item) => ({
      path: requireText(item.path, "references"),
      content: requireText(item.content, "references"),
      mimeType: item.mimeType ?? "text/markdown",
    })),
  };
}

export function toPlatformSkillCreateRequest(
  values: PlatformSkillCreateFormValues,
): PlatformSkillPackageCreateRequest {
  return {
    displayName: requireText(values.displayName, "displayName"),
    slug: requireText(values.slug, "slug"),
    description: requireText(values.description, "description"),
    ...normalizedVersionPayload(values),
  };
}

export function toPlatformSkillReplaceRequest(
  values: PlatformSkillCreateFormValues,
  expectedRevision: number,
): PlatformSkillPackageReplaceRequest {
  return {
    displayName: requireText(values.displayName, "displayName"),
    description: requireText(values.description, "description"),
    expectedRevision,
    ...normalizedVersionPayload(values),
  };
}

export function toPlatformSkillVersionRequest(
  values: PlatformSkillVersionFormValues,
): PlatformSkillVersionCreateRequest {
  return normalizedVersionPayload(values);
}

export function versionFormValues(
  version?: PlatformSkillVersionOut,
): PlatformSkillVersionFormValues {
  const instructions = version?.resources.find(
    (resource) => resource.role === "instructions",
  )?.content;
  return {
    semanticVersion: version?.semanticVersion ?? "",
    instructions: instructions ?? "",
    capabilityTags: version?.manifest.capabilityTags?.join(", ") ?? "",
    requiredTools: (version?.manifest.requiredTools ?? []).map((item) => ({ ...item })),
    permissions: (version?.manifest.permissions ?? []).map((item) => ({ ...item })),
    dataEgress: (version?.manifest.dataEgress ?? []).map((item) => ({
      ...item,
      dataClasses: [...item.dataClasses],
    })),
    references:
      version?.resources
        .filter((resource) => resource.role === "reference" && resource.content)
        .map((resource) => ({
          path: resource.path,
          content: resource.content!,
          mimeType: resource.mimeType as SkillInlineReferenceInput["mimeType"],
        })) ?? [],
  };
}

export function editFormValues(
  skill: PlatformSkillPackageDetailOut,
): PlatformSkillCreateFormValues {
  return {
    displayName: skill.displayName,
    slug: skill.slug,
    description: skill.description,
    ...versionFormValues(latestPlatformSkillVersion(skill)),
  };
}

export function latestPlatformSkillVersion(skill: PlatformSkillPackageDetailOut) {
  return [...skill.versions].sort((left, right) => right.versionNumber - left.versionNumber)[0];
}
