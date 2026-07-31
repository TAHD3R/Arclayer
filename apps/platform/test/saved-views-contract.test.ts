import { describe, expect, it } from "vitest";

import { SAVED_VIEW_DEFINITIONS, toSavedViewCommand } from "@/saved-views/saved-view-contracts";

describe("Platform Saved Views contracts", () => {
  it("defines versioned defaults only for Platform API capabilities", () => {
    expect(Object.values(SAVED_VIEW_DEFINITIONS).map((view) => view.capabilityId)).toEqual([
      "tenant.workspaces",
      "tenant.users",
      "tenant.projects",
      "monitoring.request-records",
      "monitoring.request-groups",
      "monitoring.ai-usage-groups",
      "monitoring.audit",
    ]);
  });

  it("persists only presentation intent and no transient table state", () => {
    const definition = SAVED_VIEW_DEFINITIONS.tenantWorkspaces;
    const command = toSavedViewCommand("Newest workspaces", definition, definition.defaultState);

    expect(command).toMatchObject({ filterSchemaRevision: "1", columnSchemaRevision: "1" });
    expect(command).not.toHaveProperty("page");
    expect(command).not.toHaveProperty("search");
    expect(command).not.toHaveProperty("selection");
    expect(command).not.toHaveProperty("drawer");
    expect(command).not.toHaveProperty("results");
  });
});
