import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFile(path.join(root, file), "utf8");
const MANAGEMENT_COPY_KEYS = [
  "REASON_CODE_INVALID",
  "RESTRICTION_DATE_INVALID",
  "MANAGEMENT_RESTRICTION_CHANGED",
  "MANAGEMENT_PERMISSION_ERROR",
  "MANAGEMENT_CONFLICT_ERROR",
  "MANAGEMENT_VALIDATION_ERROR",
  "MANAGEMENT_NETWORK_ERROR",
  "MANAGEMENT_ACTION_ERROR",
  "PASSWORD",
  "PASSWORD_SET",
  "PASSWORD_NOT_SET",
  "LAST_SIGN_IN",
  "USER_ACCESS_STATE",
  "USER_ACCESS_STATE_DESCRIPTION",
  "RESTRICTION_USER_DISABLED",
  "USER_NO_ACTIVE_RESTRICTIONS",
  "USER_DISABLED",
  "USER_ENABLED",
  "DISABLE_USER",
  "DISABLE_USER_DESCRIPTION",
  "ENABLE_USER",
  "ENABLE_USER_DESCRIPTION",
  "PROJECT_ACCESS_STATE",
  "PROJECT_ACCESS_STATE_DESCRIPTION",
  "RESTRICTION_PROJECT_SUSPENDED",
  "PROJECT_NO_ACTIVE_RESTRICTIONS",
  "PROJECT_DISABLED",
  "PROJECT_ENABLED",
  "DISABLE_PROJECT",
  "DISABLE_PROJECT_DESCRIPTION",
  "ENABLE_PROJECT",
  "ENABLE_PROJECT_DESCRIPTION",
  "PROJECT_OPERATIONS",
  "PROJECT_OPERATIONS_DESCRIPTION",
  "PROJECT_OPERATIONS_LOADING",
  "PROJECT_OPERATIONS_ERROR_TITLE",
  "PROJECT_OPERATIONS_ERROR_DESCRIPTION",
  "RUNTIME_STATE",
  "RUNTIME_STATE_READY",
  "RUNTIME_STATE_RUNTIME_MISSING",
  "RUNTIME_STATE_SITE_MISSING",
  "ENVIRONMENTS",
  "DEPLOYMENTS",
  "DOMAINS",
  "DOMAIN_STATE",
  "DOMAIN_VERIFIED",
  "DOMAIN_UNVERIFIED",
  "ACTIVE_RELEASE",
  "RELEASE_NUMBER",
  "PROJECT_OPERATIONS_COLLECTED_AT",
] as const;

describe("Tenant user and project management", () => {
  it("keeps only restriction and projection operations inside the generated Platform SDK boundary", async () => {
    const api = await read("apps/platform/src/api/tenant-directory.ts");

    expect(api).toContain('from "@arclayer/platform-openapi"');
    expect(api).toContain("platformDisableUser");
    expect(api).toContain("platformEnableUser");
    expect(api).toContain("platformDisableProject");
    expect(api).toContain("platformEnableProject");
    expect(api).toContain("platformGetProjectOperations");
    expect(api).not.toContain("platformUpdateUser");
    expect(api).not.toContain("platformResetUserPassword");
    expect(api).not.toContain("platformSendUserResetPasswordEmail");
    expect(api).not.toContain("platformRevokeUserSessions");
    expect(api).not.toContain("platformDisableUserTwoFactor");
    expect(api).not.toContain("platformUpdateProject");
  });

  it("wires server-confirmed dossiers into directory detail sheets and scoped audit links", async () => {
    const [users, projects, userDossier, projectDossier, sharedDialogs] = await Promise.all([
      read("apps/platform/src/pages/tenant-users.tsx"),
      read("apps/platform/src/pages/tenant-projects.tsx"),
      read("apps/platform/src/components/tenant-user-management.tsx"),
      read("apps/platform/src/components/tenant-project-management.tsx"),
      read("apps/platform/src/components/tenant-directory-mutation-dialogs.tsx"),
    ]);
    const sources = [users, projects, userDossier, projectDossier, sharedDialogs].join("\n");

    expect(users).toContain("TenantUserDossier");
    expect(projects).toContain("TenantProjectDossier");
    expect(users).toContain("onChanged: () => void");
    expect(projects).toContain("onChanged: () => void");
    expect(userDossier).toContain('to="/monitoring/audit"');
    expect(userDossier).toContain("search={{ subjectUserId: user.userId }}");
    expect(projectDossier).toContain('to="/monitoring/audit"');
    expect(projectDossier).toContain("search={{ projectId: project.projectId }}");
    expect(userDossier).toContain("setUser(next);");
    expect(projectDossier).toContain("setProject(next);");
    expect(userDossier).toContain("props.onChanged();");
    expect(projectDossier).toContain("props.onChanged();");
    expect(userDossier).not.toMatch(
      /EditTenantUserDialog|ResetTenantUserPasswordDialog|SEND_PASSWORD_RESET_EMAIL|REVOKE_USER_SESSIONS|DISABLE_USER_TWO_FACTOR/,
    );
    expect(projectDossier).not.toMatch(/EditTenantProjectDialog|EDIT_PROJECT/);
    expect(projectDossier).toContain("getTenantProjectOperations");
    expect(sharedDialogs).toContain("expectedRevision: props.activeRestriction?.revision ?? 0");
    expect(sharedDialogs).toContain("expectedRevision: props.activeRestriction!.revision");
    expect(sharedDialogs).toContain("restrictionAttempt.current?.fingerprint === fingerprint");
    expect(sharedDialogs).toContain("restrictionAttempt.current = null");
    expect(sharedDialogs).not.toContain("TenantDirectoryConfirmationDialog");
    expect(sources).not.toMatch(/apps\/admin|@arclayer\/admin/);
    expect(sources).not.toMatch(/mock|simulation/i);
  });

  it("ships bilingual tenant-management copy for every new action and state", async () => {
    const [enUs, zhCn] = await Promise.all([
      read("apps/platform/locales/en-US/tenants.json"),
      read("apps/platform/locales/zh-CN/tenants.json"),
    ]);
    const enUsKeys = Object.keys(JSON.parse(enUs) as Record<string, unknown>);
    const zhCnKeys = Object.keys(JSON.parse(zhCn) as Record<string, unknown>);

    expect(enUsKeys).toEqual(expect.arrayContaining([...MANAGEMENT_COPY_KEYS]));
    expect(zhCnKeys).toEqual(expect.arrayContaining([...MANAGEMENT_COPY_KEYS]));
  });
});
