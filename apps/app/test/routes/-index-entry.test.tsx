import { describe, expect, test } from "vitest";

import { Route } from "@/routes/index";

describe("index route", () => {
  test("exports root route", () => {
    expect(Route).toBeTruthy();
  });
});
