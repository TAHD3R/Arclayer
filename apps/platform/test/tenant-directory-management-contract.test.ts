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
  "WORKING",
  "USER_SECURITY_ACTIONS",
  "USER_SECURITY_ACTIONS_DESCRIPTION",
  "USER_NO_EMAIL",
  "USER_RESET_PASSWORD",
  "USER_RESET_PASSWORD_DESCRIPTION",
  "USER_RESET_PASSWORD_NEW",
  "USER_RESET_PASSWORD_CONFIRM",
  "USER_RESET_PASSWORD_MISMATCH",
  "USER_RESET_PASSWORD_TOO_SHORT",
  "USER_RESET_PASSWORD_HANDOFF",
  "USER_RESET_PASSWORD_DONE",
  "USER_SEND_RESET_EMAIL",
  "USER_SEND_RESET_EMAIL_DESCRIPTION",
  "USER_SEND_RESET_EMAIL_DONE",
  "USER_REVOKE_SESSIONS",
  "USER_REVOKE_SESSIONS_DESCRIPTION",
  "USER_REVOKE_SESSIONS_DONE",
  "USER_DISABLE_2FA",
  "USER_DISABLE_2FA_DESCRIPTION",
  "USER_DISABLE_2FA_DONE",
  "USER_DELETE_ACCOUNT",
  "USER_DELETE_ACCOUNT_DESCRIPTION",
  "USER_DELETE_ACCOUNT_CONSEQUENCES",
  "USER_DELETE_ACCOUNT_DONE",
  "USER_DELETED_DESCRIPTION",
  "USER_ACTION_FAILED",
  "USER_OAUTH_PROVIDERS",
  "USER_UNLINK_OAUTH",
  "USER_UNLINK_OAUTH_DESCRIPTION",
  "USER_UNLINK_OAUTH_DONE",
] as const;

describe("Tenant user and project management", () => {
  it("keeps restriction, projection, and user lifecycle operations inside the generated Platform SDK boundary", async () => {
    const api = await read("apps/platform/src/api/tenant-directory.ts");

    expect(api).toContain('from "@arclayer/platform-openapi"');
    expect(api).toContain("platformDisableUser");
    expect(api).toContain("platformEnableUser");
    expect(api).toContain("platformResetUserPassword");
    expect(api).toContain("platformSendUserResetPasswordEmail");
    expect(api).toContain("platformRevokeUserSessions");
    expect(api).toContain("platformDisableUserTwoFactor");
    expect(api).toContain("platformDeleteUserAccount");
    expect(api).toContain("platformUnlinkUserOauthIdentity");
    expect(api).toContain("unwrapVoid");
    expect(api).toContain("platformDisableProject");
    expect(api).toContain("platformEnableProject");
    expect(api).toContain("platformGetProjectOperations");
    expect(api).not.toContain("platformUpdateUser");
    expect(api).not.toContain("platformUpdateProject");
  });

  it("wires server-confirmed dossiers into directory detail sheets and scoped audit links", async () => {
    const [users, projects, userDossier, projectDossier, sharedDialogs, securityActions] =
      await Promise.all([
        read("apps/platform/src/pages/tenant-users.tsx"),
        read("apps/platform/src/pages/tenant-projects.tsx"),
        read("apps/platform/src/components/tenant-user-management.tsx"),
        read("apps/platform/src/components/tenant-project-management.tsx"),
        read("apps/platform/src/components/tenant-directory-mutation-dialogs.tsx"),
        read("apps/platform/src/components/tenant-user-security-actions.tsx"),
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
    expect(userDossier).toContain("<TenantUserSecurityActions");
    expect(userDossier).toContain("onDeleted={() => {");
    expect(userDossier).not.toMatch(/EditTenantUserDialog/);
    expect(projectDossier).not.toMatch(/EditTenantProjectDialog|EDIT_PROJECT/);
    expect(projectDossier).toContain("getTenantProjectOperations");
    expect(sharedDialogs).toContain("expectedRevision: props.activeRestriction?.revision ?? 0");
    expect(sharedDialogs).toContain("expectedRevision: props.activeRestriction!.revision");
    expect(sharedDialogs).toContain("restrictionAttempt.current?.fingerprint === fingerprint");
    expect(sharedDialogs).toContain("restrictionAttempt.current = null");
    expect(sharedDialogs).not.toContain("TenantDirectoryConfirmationDialog");
    expect(sources).not.toMatch(/apps\/admin|@arclayer\/admin/);
    expect(sources).not.toMatch(/mock|simulation/i);

    expect(securityActions).toContain("resetTenantUserPassword");
    expect(securityActions).toContain("sendTenantUserResetPasswordEmail");
    expect(securityActions).toContain("revokeTenantUserSessions");
    expect(securityActions).toContain("disableTenantUserTwoFactor");
    expect(securityActions).toContain("deleteTenantUserAccount");
    expect(securityActions).toContain("unlinkTenantUserOauthProvider");
    expect(securityActions).toContain("USER_RESET_PASSWORD_MISMATCH");
    expect(securityActions).toContain("USER_DELETE_ACCOUNT_CONSEQUENCES");
    expect(securityActions).toContain("TenantDirectoryApiError");
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
