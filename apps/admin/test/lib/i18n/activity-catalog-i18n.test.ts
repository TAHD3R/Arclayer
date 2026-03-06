import { describe, expect, it } from "vitest";

import zhActivity from "@locales/zh-CN/activity.json";
import enActivity from "@locales/en-US/activity.json";
import { ACTIVITY_EVENT_CATALOG } from "@/pages/organization/activity/constants";

const REQUIRED_ACTIVITY_EVENTS = [
  "auth.login.succeeded",
  "auth.password.reset.requested",
  "auth.password.reset.completed",
  "workspace.member.status.updated",
  "workspace.member.roles.updated",
  "workspace.member.profile.updated",
  "workspace.member.password.reset",
  "workspace.invite.email.created",
  "workspace.invite.email.updated",
  "workspace.invite.email.renewed",
  "workspace.invite.email.revoked",
  "workspace.invite.link.created",
  "workspace.invite.link.renewed",
  "workspace.invite.link.disabled",
  "workspace.invite.accepted",
  "rbac.role.created",
  "rbac.role.updated",
  "rbac.role.deleted",
  "rbac.permission.roles_set",
  "rbac.role.permissions_set",
  "system.setup.completed",
  "settings.updated",
  "plugin.installed",
  "plugin.enabled",
  "plugin.disabled",
  "asset.uploaded",
] as const;

function hasI18nKey(resource: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(resource, key);
}

describe("activity catalog i18n coverage", () => {
  it("covers all required activity events", () => {
    for (const eventName of REQUIRED_ACTIVITY_EVENTS) {
      expect(ACTIVITY_EVENT_CATALOG[eventName]).toBeDefined();
    }
  });

  it("has zh-CN and en-US keys for catalog entries", () => {
    for (const entry of Object.values(ACTIVITY_EVENT_CATALOG)) {
      expect(hasI18nKey(zhActivity, entry.titleKey)).toBe(true);
      expect(hasI18nKey(enActivity, entry.titleKey)).toBe(true);
      if (entry.descriptionKey) {
        expect(hasI18nKey(zhActivity, entry.descriptionKey)).toBe(true);
        expect(hasI18nKey(enActivity, entry.descriptionKey)).toBe(true);
      }
    }
  });

  it("defines fallback copy for unknown events", () => {
    expect(hasI18nKey(zhActivity, "ACTIVITY_EVENT_UNKNOWN_TITLE")).toBe(true);
    expect(hasI18nKey(zhActivity, "ACTIVITY_EVENT_UNKNOWN_DESC")).toBe(true);
    expect(hasI18nKey(enActivity, "ACTIVITY_EVENT_UNKNOWN_TITLE")).toBe(true);
    expect(hasI18nKey(enActivity, "ACTIVITY_EVENT_UNKNOWN_DESC")).toBe(true);
  });
});
