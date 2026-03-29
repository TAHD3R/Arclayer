import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ACTION_COLUMN_FILES = [
  "src/pages/usercenter/security/components/security-sessions-table-view.tsx",
  "src/pages/workspaces/assets/components/assets-view-table-section.tsx",
  "src/pages/workspaces/content/library/components/content-library-table-columns.tsx",
  "src/pages/workspaces/team/invitations/components/team-invitations-view.tsx",
] as const;

describe("admin table action columns", () => {
  it("use the shared action-column helpers in every table file with an actions column", () => {
    for (const relativePath of ACTION_COLUMN_FILES) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

      expect(source, relativePath).toContain("buildDataTableActionsColumnMeta");
      expect(source, relativePath).toContain("DataTableActionsCell");
    }
  });
});
