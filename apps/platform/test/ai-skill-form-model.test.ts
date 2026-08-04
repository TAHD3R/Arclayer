import { describe, expect, it } from "vitest";
import type { PlatformSkillPackageDetailOut } from "@arclayer/platform-openapi";

import {
  PlatformSkillFormError,
  editFormValues,
  toPlatformSkillCreateRequest,
} from "@/ai/ai-skill-form-model";

describe("Platform Skill form model", () => {
  it("builds a typed complete package payload", () => {
    expect(
      toPlatformSkillCreateRequest({
        displayName: " Accessibility review ",
        slug: " accessibility-review ",
        description: " Review the interface. ",
        semanticVersion: " 1.0.0 ",
        instructions: " Check every interactive control. ",
        capabilityTags: "accessibility, review, accessibility",
        requiredTools: [
          {
            toolId: "human.request_input",
            versionRange: " >=1 ",
            intendedUse: " Ask for missing context. ",
          },
        ],
        permissions: [{ action: "content.read", purpose: " Read the page content. " }],
        dataEgress: [
          {
            destination: "api.example.com",
            purpose: "Send an aggregate report.",
            dataClasses: [" analytics.aggregate ", "analytics.aggregate"],
          },
        ],
        references: [
          {
            path: "references/checklist.md",
            content: " # Checklist ",
            mimeType: "text/markdown",
          },
        ],
      }),
    ).toEqual({
      displayName: "Accessibility review",
      slug: "accessibility-review",
      description: "Review the interface.",
      semanticVersion: "1.0.0",
      instructions: "Check every interactive control.",
      capabilityTags: ["accessibility", "review"],
      requiredTools: [
        {
          toolId: "human.request_input",
          versionRange: ">=1",
          intendedUse: "Ask for missing context.",
        },
      ],
      permissions: [{ action: "content.read", purpose: "Read the page content." }],
      dataEgress: [
        {
          destination: "api.example.com",
          purpose: "Send an aggregate report.",
          dataClasses: ["analytics.aggregate"],
        },
      ],
      references: [
        {
          path: "references/checklist.md",
          content: "# Checklist",
          mimeType: "text/markdown",
        },
      ],
    });
  });

  it("rejects an egress declaration without a data class", () => {
    expect(() =>
      toPlatformSkillCreateRequest({
        displayName: "Review",
        slug: "review",
        description: "Review content.",
        semanticVersion: "",
        instructions: "Review the content.",
        capabilityTags: "",
        requiredTools: [],
        permissions: [],
        dataEgress: [{ destination: "api.example.com", purpose: "Send data.", dataClasses: [] }],
        references: [],
      }),
    ).toThrow(new PlatformSkillFormError("dataEgress"));
  });

  it("prefills complete editable content from the latest version", () => {
    const skill = {
      displayName: "Review",
      slug: "review",
      description: "Review content.",
      versions: [
        version(1, "Old instructions"),
        version(2, "Current instructions", {
          path: "references/voice.md",
          content: "Use a direct tone.",
          mimeType: "text/markdown",
        }),
      ],
    } as PlatformSkillPackageDetailOut;

    expect(editFormValues(skill)).toMatchObject({
      displayName: "Review",
      slug: "review",
      description: "Review content.",
      instructions: "Current instructions",
      references: [
        {
          path: "references/voice.md",
          content: "Use a direct tone.",
          mimeType: "text/markdown",
        },
      ],
    });
  });
});

function version(
  versionNumber: number,
  instructions: string,
  reference?: { path: string; content: string; mimeType: string },
) {
  return {
    versionNumber,
    semanticVersion: `${versionNumber}.0.0`,
    manifest: { capabilityTags: [], requiredTools: [], permissions: [], dataEgress: [] },
    resources: [
      { role: "instructions", path: "SKILL.md", content: instructions, mimeType: "text/markdown" },
      ...(reference ? [{ ...reference, role: "reference" }] : []),
    ],
  } as unknown as PlatformSkillPackageDetailOut["versions"][number];
}
