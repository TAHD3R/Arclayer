import { describe, expect, test } from "vitest";

import {
  buildContentModelFieldPayload,
  createContentModelFieldDraft,
  type ContentModelBuiltInFieldTypeId,
} from "@/pages/projects/content/models/fields";

import type { ContentModelFieldContract as CreateAdminContentModelFieldPayload } from "@arclayer/openapi";

type FieldConfigMatrixCase = {
  typeId: ContentModelBuiltInFieldTypeId;
  expectedScalar: CreateAdminContentModelFieldPayload["scalar"];
  draft: Partial<ReturnType<typeof createContentModelFieldDraft>>;
  expectedConfig: Record<string, unknown>;
  absentConfigKeys?: string[];
};

const FIELD_CONFIG_MATRIX_CASES: FieldConfigMatrixCase[] = [
  {
    typeId: "short_text",
    expectedScalar: "text",
    draft: { defaultValue: "Title", regexPattern: "^public$", minLength: "2", maxLength: "80" },
    expectedConfig: { defaultValue: "Title", pattern: "^public$", minLength: 2, maxLength: 80 },
  },
  {
    typeId: "rich_text",
    expectedScalar: "long_text",
    draft: {
      defaultValue: "Body",
      regexPattern: "^hidden$",
      minLength: "5",
      maxLength: "2000",
    },
    expectedConfig: { defaultValue: "Body", editor: "structured", minLength: 5, maxLength: 2000 },
    absentConfigKeys: ["pattern"],
  },
  {
    typeId: "markdown",
    expectedScalar: "long_text",
    draft: {
      defaultValue: "# Body",
      regexPattern: "^hidden$",
      minLength: "5",
      maxLength: "2000",
    },
    expectedConfig: { defaultValue: "# Body", editor: "markdown", minLength: 5, maxLength: 2000 },
    absentConfigKeys: ["pattern"],
  },
  {
    typeId: "slug",
    expectedScalar: "text",
    draft: { defaultValue: "hello-world", regexPattern: "^[a-z0-9-]+$", minLength: "3" },
    expectedConfig: { defaultValue: "hello-world", pattern: "^[a-z0-9-]+$", minLength: 3 },
  },
  {
    typeId: "email",
    expectedScalar: "text",
    draft: {
      defaultValue: "editor@example.com",
      regexPattern: ".+@example\\.com$",
      maxLength: "120",
    },
    expectedConfig: {
      defaultValue: "editor@example.com",
      pattern: ".+@example\\.com$",
      maxLength: 120,
    },
  },
  {
    typeId: "password",
    expectedScalar: "text",
    draft: {
      defaultValue: "temporary",
      regexPattern: "^hidden$",
      minLength: "12",
      maxLength: "128",
    },
    expectedConfig: {
      defaultValue: "temporary",
      omitFromApiResponse: true,
      minLength: 12,
      maxLength: 128,
    },
    absentConfigKeys: ["pattern"],
  },
  {
    typeId: "number",
    expectedScalar: "number",
    draft: { defaultValue: "12", numberFormat: "integer", numberMin: "1", numberMax: "99" },
    expectedConfig: { defaultValue: "12", numberFormat: "integer", min: 1, max: 99 },
  },
  {
    typeId: "decimal",
    expectedScalar: "number",
    draft: { defaultValue: "12.25", decimalPlaces: "3", numberMin: "0.5", numberMax: "99.75" },
    expectedConfig: { defaultValue: "12.25", decimalPlaces: 3, min: 0.5, max: 99.75 },
    absentConfigKeys: ["numberFormat"],
  },
  {
    typeId: "biginteger",
    expectedScalar: "number",
    draft: { defaultValue: "9007199254740993", numberMin: "10", numberMax: "100000" },
    expectedConfig: { defaultValue: "9007199254740993", min: 10, max: 100000 },
    absentConfigKeys: ["numberFormat", "decimalPlaces"],
  },
  {
    typeId: "enumeration",
    expectedScalar: "text",
    draft: { defaultValue: "draft", enumerationOptions: "draft\npublished" },
    expectedConfig: { defaultValue: "draft", options: ["draft", "published"] },
  },
  {
    typeId: "date_time",
    expectedScalar: "date_time",
    draft: { defaultValue: "2026-05-09T12:00:00Z" },
    expectedConfig: { defaultValue: "2026-05-09T12:00:00Z" },
  },
  {
    typeId: "time",
    expectedScalar: "date_time",
    draft: { defaultValue: "12:30:00" },
    expectedConfig: { defaultValue: "12:30:00" },
  },
  {
    typeId: "date",
    expectedScalar: "date_time",
    draft: { defaultValue: "2026-05-09" },
    expectedConfig: { defaultValue: "2026-05-09" },
  },
  {
    typeId: "media",
    expectedScalar: "json",
    draft: {
      mediaAllowedTypes: ["videos", "files"],
      mediaMode: "multiple",
      mediaMin: "1",
      mediaMax: "4",
    },
    expectedConfig: {
      allowedTypes: ["videos", "files"],
      mediaMode: "multiple",
      assetScope: "project",
      min: 1,
      max: 4,
    },
    absentConfigKeys: ["mediaKind"],
  },
  {
    typeId: "location",
    expectedScalar: "json",
    draft: {},
    expectedConfig: {},
  },
  {
    typeId: "boolean",
    expectedScalar: "boolean",
    draft: { booleanDefault: "true" },
    expectedConfig: { defaultValue: true },
  },
  {
    typeId: "json_object",
    expectedScalar: "json",
    draft: {},
    expectedConfig: {},
  },
  {
    typeId: "reference",
    expectedScalar: "json",
    draft: {
      referenceMode: "multiple",
      referenceTargetModelKey: "article",
      referenceMin: "1",
      referenceMax: "3",
    },
    expectedConfig: { referenceMode: "multiple", targetModelKey: "article", min: 1, max: 3 },
  },
  {
    typeId: "component",
    expectedScalar: "json",
    draft: {
      componentRepeatable: true,
      componentTargetModelKey: "seoBlock",
      componentMin: "1",
      componentMax: "3",
    },
    expectedConfig: { repeatable: true, targetComponentKey: "seoBlock", min: 1, max: 3 },
  },
  {
    typeId: "dynamic_zone",
    expectedScalar: "json",
    draft: {
      dynamicZoneComponentKeys: "heroBlock\nquoteBlock",
      dynamicZoneMin: "1",
      dynamicZoneMax: "4",
    },
    expectedConfig: { components: ["heroBlock", "quoteBlock"], min: 1, max: 4 },
  },
  {
    typeId: "blocks",
    expectedScalar: "json",
    draft: { blocksAllowedBlocks: "hero\nquote", blocksMin: "1", blocksMax: "5" },
    expectedConfig: { allowedBlocks: ["hero", "quote"], min: 1, max: 5 },
  },
];

describe("content model field configuration matrix", () => {
  test.each(FIELD_CONFIG_MATRIX_CASES)(
    "$typeId builds the expected field payload configuration",
    ({ typeId, expectedScalar, draft, expectedConfig, absentConfigKeys = [] }) => {
      const payload = buildContentModelFieldPayload(
        createContentModelFieldDraft(typeId, {
          name: "Field",
          ...draft,
        }),
      );

      expect(payload.scalar).toBe(expectedScalar);
      expect(payload.config).toMatchObject({
        kind: typeId,
        ...expectedConfig,
      });
      for (const key of absentConfigKeys) {
        expect(payload.config).not.toHaveProperty(key);
      }
    },
  );

  test("media fields default to unrestricted media type unless configured", () => {
    const payload = buildContentModelFieldPayload(createContentModelFieldDraft("media"));

    expect(payload.config).toMatchObject({
      kind: "media",
      mediaMode: "single",
      assetScope: "project",
    });
    expect(payload.config).not.toHaveProperty("mediaKind");
    expect(payload.config).not.toHaveProperty("allowedTypes");
  });
});
