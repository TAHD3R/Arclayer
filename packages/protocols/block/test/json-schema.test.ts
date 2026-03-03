import { describe, expect, test } from "vitest";

import { exportBlockManifestJsonSchema, exportPageBlueprintJsonSchema } from "../src/json-schema";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

describe("protocol/json-schema exports", () => {
  test("exportPageBlueprintJsonSchema() is stable and contains node discriminator", () => {
    const schema = exportPageBlueprintJsonSchema();
    const schemaRec = asRecord(schema);
    const defs = asRecord(schemaRec.$defs);
    const node = asRecord(defs.DesignNodeV1);
    const discriminator = asRecord(node.discriminator);
    expect(schemaRec.$id).toBe("celestial://page-blueprint-v1.json");
    expect(discriminator.propertyName).toBe("type");

    // Snapshot key structure (keep snapshot small and stable).
    expect({
      id: schemaRec.$id,
      required: schemaRec.required,
      defs: Object.keys(defs).sort(),
    }).toMatchSnapshot();
  });

  test("exportBlockManifestJsonSchema() is stable and contains styleOverrideWhitelist", () => {
    const schema = exportBlockManifestJsonSchema();
    const schemaRec = asRecord(schema);
    const props = asRecord(schemaRec.properties);
    expect(schemaRec.$id).toBe("celestial://block-manifest-v1.json");
    expect(props.styleOverrideWhitelist).toBeTruthy();

    expect({
      id: schemaRec.$id,
      required: schemaRec.required,
      defs: Object.keys(asRecord(schemaRec.$defs)).sort(),
    }).toMatchSnapshot();
  });
});
