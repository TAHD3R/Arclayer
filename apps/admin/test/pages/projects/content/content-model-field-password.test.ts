import { describe, expect, it } from "vitest";

import {
  buildContentModelFieldPayload,
  CONTENT_MODEL_FIELD_TYPE_GROUPS,
  createContentModelFieldDraft,
  getContentModelFieldTypeDescriptionKey,
  getContentModelFieldTypeLabelKey,
} from "@/pages/projects/content/models/fields";

describe("content model password field type", () => {
  it("is available in the text field picker group", () => {
    const textGroup = CONTENT_MODEL_FIELD_TYPE_GROUPS.find((group) => group.id === "text");

    expect(textGroup?.typeIds).toContain("password");
    expect(getContentModelFieldTypeLabelKey("password")).toBe(
      "CONTENT_MODELS_FIELD_TYPE_PASSWORD_LABEL",
    );
    expect(getContentModelFieldTypeDescriptionKey("password")).toBe(
      "CONTENT_MODELS_FIELD_TYPE_PASSWORD_DESC",
    );
  });

  it("builds a write-only password field payload", () => {
    const draft = createContentModelFieldDraft("password", {
      name: "Access code",
      minLength: "12",
      maxLength: "128",
    });

    const payload = buildContentModelFieldPayload(draft);

    expect(payload.scalar).toBe("text");
    expect(payload.config).toMatchObject({
      kind: "password",
      localizable: false,
      omitFromApiResponse: true,
      minLength: 12,
      maxLength: 128,
    });
  });
});
