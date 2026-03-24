import { describe, expect, it } from "vitest";

import { createDefaultActivityFilters } from "@/pages/organization/activity/utils";

describe("activity utils", () => {
  it("does not prefill a default occurred-at range", () => {
    expect(createDefaultActivityFilters()).toEqual({});
  });
});
