import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_PATH = resolve(
  process.cwd(),
  "src/pages/workspaces/assets/components/assets-view-table-section.tsx",
);

describe("assets-view-table-section hook ordering", () => {
  it("defines columns before column pinning reads them for initial state", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const columnsIndex = source.indexOf("const columns = useMemo(");
    const pinningIndex = source.indexOf(
      "const [columnPinning, setColumnPinning] = useState(() => resolveDefaultColumnPinning(columns));",
    );

    expect(columnsIndex).toBeGreaterThan(-1);
    expect(pinningIndex).toBeGreaterThan(-1);
    expect(columnsIndex).toBeLessThan(pinningIndex);
  });
});
