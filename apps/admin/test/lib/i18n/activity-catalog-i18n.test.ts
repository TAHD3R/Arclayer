import { describe, expect, it } from "vitest";

import zhActivity from "@locales/zh-CN/activity.json";
import enActivity from "@locales/en-US/activity.json";
import { ACTIVITY_EVENT_CATALOG } from "@/pages/workspaces/shared/activity/constants";

const API_AUDIT_ACTIONS = [
  // Auth
  "auth.login",
  "auth.password.updated",
  "auth.password.reset.requested",
  "auth.password.reset.completed",
  "auth.account.deleted",
  "auth.session.revoked",
  "auth.mfa.enabled",
  "auth.mfa.disabled",
  "auth.mfa.backup_codes_regenerated",
  "auth.sso.linked",
  "auth.sso.unlinked",

  // Organization / Workspace
  "organization.invite.accepted",
  "organization.member.invited",
  "organization.member.role_updated",
  "organization.member.removed",
  "organization.settings.updated",
  "workspace.created",
  "workspace.updated",
  "workspace.archived",
  "workspace.deleted",
  "workspace.invite.email.created",
  "workspace.invite.email.updated",
  "workspace.invite.email.renewed",
  "workspace.invite.email.revoked",
  "workspace.invite.link.created",
  "workspace.invite.link.renewed",
  "workspace.invite.link.disabled",
  "workspace.invite.accepted",
  "workspace.invitation.accepted",
  "workspace.member.status.updated",
  "workspace.member.roles.updated",
  "workspace.member.profile.updated",
  "workspace.member.password.reset",
  "settings.workspace.core.updated",
  "permission.assignment.changed",

  // Commerce / Feedback
  "commerce.plan.updated",
  "commerce.subscription.updated",
  "commerce.subscription_change.requested",
  "commerce.subscription_change.approved",
  "commerce.subscription_change.rejected",
  "feedback.submitted",
  "feedback.updated",
  "feedback.message.added",

  // Projects / Delivery
  "project.created",
  "project.updated",
  "project.archived",
  "project.deleted",
  "project.settings.updated",
  "project.environment.updated",
  "deployment.promoted",
  "deployment.failed",
  "release.published",
  "release.rolled_back",
  "project.release.scheduled_publish.completed",
  "project.release.scheduled_publish.failed",
  "me.api_key.created",
  "me.api_key.rotated",
  "me.api_key.revoked",
  "project.api_key.created",
  "project.api_key.rotated",
  "project.api_key.revoked",
  "project.preview_token.created",
  "agent.approval.applied",

  // Content
  "content.model.created",
  "content.model.updated",
  "content.model.deleted",
  "content.item.created",
  "content.item.updated",
  "content.item.deleted",
  "content.item.published",
  "content.item.unpublished",
  "content.item.restored",
  "project.content.item.archived",
  "project.content.item.bootstrap.applied",
  "project.content.item.duplicated",
  "project.content.item.translation.created",
  "project.content.item.unarchived",
  "project.content.item.workflow.updated",
  "project.content.version.archived",
  "project.content.version.scheduled",

  // Assets
  "asset.uploaded",
  "asset.folder.created",
  "asset.folder.updated",
  "asset.folder.deleted",
  "asset.metadata.updated",
  "asset.moved",
  "asset.deleted",
] as const;

const AUDIT_LOG_REGRESSION_ACTIONS = [
  "commerce.subscription_change.rejected",
  "commerce.subscription_change.requested",
  "commerce.subscription_change.approved",
  "auth.login",
  "project.archived",
  "content.model.created",
  "deployment.promoted",
  "release.published",
  "content.item.published",
  "content.item.created",
  "project.settings.updated",
  "project.created",
] as const;

function hasI18nKey(resource: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(resource, key);
}

describe("activity catalog i18n coverage", () => {
  it("covers stable actions emitted by current API audit producers", () => {
    for (const action of API_AUDIT_ACTIONS) {
      expect(ACTIVITY_EVENT_CATALOG[action], action).toBeDefined();
      expect(ACTIVITY_EVENT_CATALOG[action]?.descriptionKey, action).toBeTruthy();
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

  it("keeps actions observed in the platform audit log fully productized", () => {
    for (const action of AUDIT_LOG_REGRESSION_ACTIONS) {
      const entry = ACTIVITY_EVENT_CATALOG[action];
      expect(entry, action).toBeDefined();
      expect(zhActivity[entry.titleKey as keyof typeof zhActivity], action).toBeTruthy();
      expect(enActivity[entry.titleKey as keyof typeof enActivity], action).toBeTruthy();
      expect(zhActivity[entry.descriptionKey as keyof typeof zhActivity], action).toBeTruthy();
      expect(enActivity[entry.descriptionKey as keyof typeof enActivity], action).toBeTruthy();
    }
  });

  it("defines fallback copy for unknown events", () => {
    expect(hasI18nKey(zhActivity, "ACTIVITY_EVENT_UNKNOWN_TITLE")).toBe(true);
    expect(hasI18nKey(zhActivity, "ACTIVITY_EVENT_UNKNOWN_DESC")).toBe(true);
    expect(hasI18nKey(enActivity, "ACTIVITY_EVENT_UNKNOWN_TITLE")).toBe(true);
    expect(hasI18nKey(enActivity, "ACTIVITY_EVENT_UNKNOWN_DESC")).toBe(true);
  });
});
