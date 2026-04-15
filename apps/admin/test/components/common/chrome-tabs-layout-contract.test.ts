import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CHROME_TABS_PATH = resolve(
  process.cwd(),
  "../../packages/ui/src/chrome-tabs/chrome-tabs.tsx",
);

describe("chrome tabs layout contract", () => {
  it("does not inject default top padding into tab panels", () => {
    const source = readFileSync(CHROME_TABS_PATH, "utf8");

    expect(source).toContain('className={cn("mt-0", className)}');
    expect(source).not.toContain('className={cn("mt-0 pt-4", className)}');
  });
});
