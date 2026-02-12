import { describe, expect, it, vi } from "vitest";

import {
  createOrganizationMembersColumns,
  ORG_ROLE_OPTIONS,
} from "@/pages/organization/members/members-columns";

describe("createOrganizationMembersColumns", () => {
  it("maps sortable columns to backend ordering keys", () => {
    const columns = createOrganizationMembersColumns({
      t: (key) => key,
      roleOptions: ORG_ROLE_OPTIONS.map((role) => ({ value: role, label: role })),
      roleUpdating: false,
      formatDateTime: () => "formatted",
      onRoleChange: vi.fn(),
      onRemove: vi.fn(),
    });

    const sortKeyById = new Map<string, string | undefined>(
      columns.map((column) => [String(column.id), column.meta?.sortKey]),
    );

    expect(sortKeyById.get("member")).toBe("username");
    expect(sortKeyById.get("role")).toBe("role_code");
    expect(sortKeyById.get("status")).toBe("status");
    expect(sortKeyById.get("joined")).toBe("joined_at");
    expect(sortKeyById.get("lastLogin")).toBe("last_login_at");
    expect(sortKeyById.get("actions")).toBeUndefined();
  });
});
