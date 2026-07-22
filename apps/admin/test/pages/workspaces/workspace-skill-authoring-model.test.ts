import { describe, expect, it } from "vitest";

import {
  skillAuthoringSchema,
  toSkillVersionPayload,
} from "@/pages/workspaces/settings/workspace/skills/workspace-skill-authoring-model";

describe("Workspace Skill authoring model", () => {
  it("normalizes declaration identities into a strict version payload", () => {
    const values = skillAuthoringSchema.parse({
      displayName: " Editorial Planner ",
      slug: "editorial-planner",
      description: " Plan evidence-led content. ",
      instructions: " Use approved evidence only. ",
      semanticVersion: " 1.0.0 ",
      capabilityTags: "content.editorial, brand.voice, content.editorial",
      references: [{ path: "references/voice.md", content: "# Voice" }],
      requiredTools: [
        {
          toolId: "human.request_input",
          versionRange: ">=1",
          intendedUse: "Ask the editor for missing context.",
        },
      ],
      permissions: [{ action: "content.read", purpose: "Read approved content." }],
      dataEgress: [
        {
          destination: "api.example.com",
          purpose: "Send public aggregates.",
          dataClasses: "content.public, analytics.aggregate, content.public",
        },
      ],
    });

    expect(toSkillVersionPayload(values)).toEqual({
      instructions: "Use approved evidence only.",
      semanticVersion: "1.0.0",
      capabilityTags: ["content.editorial", "brand.voice"],
      references: [
        {
          path: "references/voice.md",
          content: "# Voice",
          mimeType: "text/markdown",
        },
      ],
      requiredTools: [
        {
          toolId: "human.request_input",
          versionRange: ">=1",
          intendedUse: "Ask the editor for missing context.",
        },
      ],
      permissions: [{ action: "content.read", purpose: "Read approved content." }],
      dataEgress: [
        {
          destination: "api.example.com",
          purpose: "Send public aggregates.",
          dataClasses: ["content.public", "analytics.aggregate"],
        },
      ],
    });
  });

  it("rejects executable entrypoint replacement and traversal-like references", () => {
    const base = {
      displayName: "Editorial Planner",
      slug: "editorial-planner",
      description: "Plan content.",
      instructions: "Use evidence.",
      semanticVersion: "",
      capabilityTags: "",
      requiredTools: [],
      permissions: [],
      dataEgress: [],
    };
    expect(
      skillAuthoringSchema.safeParse({
        ...base,
        references: [{ path: "SKILL.md", content: "replace" }],
      }).success,
    ).toBe(false);
    expect(
      skillAuthoringSchema.safeParse({
        ...base,
        references: [{ path: "../secret.md", content: "escape" }],
      }).success,
    ).toBe(false);
  });
});
