import { describe, expect, it } from "vitest";

import { i18nResources } from "@/lib/i18n/resources";

const MACHINE_TRANSLATION_RESIDUE =
  /twofactor|not不存在|not归档|not已发布|not可|fieldorder|impact预览|query必填|protocol|presentation|transferimport|immutable|validationfailed|primaryrecord|routenot|aliasnot|copytarget|jobnot|jobretry|templatenot|onboardingcompleted|onboardingstate|tenantnot|capability_id|presencevalkey|resolvedb|setnot|邮箱same|unauthorized|generatefailed|generationfailed|deleteconfirm|systemimmutable|username(?:存在|必填)|reset(?:存储|令牌)|current会话|menunot|db必填/i;

function normalizeErrorCodeLikeText(value: string): string {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.join(" ") ?? ""
  );
}

describe("Product error copy quality", () => {
  it("keeps complete bilingual Product error resources", () => {
    const zhErrors = i18nResources["zh-CN"].errors;
    const enErrors = i18nResources["en-US"].errors;
    const machineTranslationResidueKeys: string[] = [];
    const errorCodeLikeEnglishKeys: string[] = [];

    expect(Object.keys(zhErrors).sort()).toEqual(Object.keys(enErrors).sort());
    expect(zhErrors).toHaveProperty("DESIGN_SYSTEM_ASSET_INVALID");
    expect(zhErrors).toHaveProperty("DESIGN_SYSTEM_PUBLICATION_RENDERER_UNAVAILABLE");

    for (const [key, zhCopy] of Object.entries(zhErrors)) {
      const enCopy = enErrors[key as keyof typeof enErrors];
      expect(zhCopy.trim()).not.toBe("");
      expect(enCopy.trim()).not.toBe("");
      expect(zhCopy).not.toBe(key);
      expect(enCopy).not.toBe(key);
      if (MACHINE_TRANSLATION_RESIDUE.test(zhCopy)) machineTranslationResidueKeys.push(key);
      if (normalizeErrorCodeLikeText(enCopy) === normalizeErrorCodeLikeText(key)) {
        errorCodeLikeEnglishKeys.push(key);
      }
    }

    expect(machineTranslationResidueKeys).toEqual([]);
    expect(errorCodeLikeEnglishKeys).toEqual([]);
  });

  it("uses actionable two-step verification errors", () => {
    expect(i18nResources["zh-CN"].errors).toMatchObject({
      BACKUP_CODE_INVALID: "恢复码不正确，请重试。",
      TWO_FACTOR_CHALLENGE_EXPIRED: "本次两步验证已过期，请重新登录。",
      TWO_FACTOR_CODE_INVALID: "身份验证器验证码不正确，请重试。",
      TWO_FACTOR_REQUIRED: "请完成两步验证后继续。",
    });
    expect(i18nResources["en-US"].errors).toMatchObject({
      BACKUP_CODE_INVALID: "That recovery code is incorrect. Try again.",
      TWO_FACTOR_CHALLENGE_EXPIRED: "This verification has expired. Sign in again.",
      TWO_FACTOR_CODE_INVALID: "That authenticator code is incorrect. Try again.",
      TWO_FACTOR_REQUIRED: "Complete two-step verification to continue.",
    });
  });

  it("keeps high-risk domain errors aligned with their actual recovery path", () => {
    expect(i18nResources["zh-CN"].errors).toMatchObject({
      AGENT_APPROVAL_NOT_FOUND: "未找到该 Agent 审批记录，请刷新后重试。",
      API_KEY_SITE_MISMATCH: "访问密钥属于其他站点，请使用当前站点创建的密钥。",
      CONTENT_ITEM_SINGLE_TYPE_ALREADY_EXISTS:
        "该单条内容模型在此语言下已有内容项，请编辑现有内容项。",
      CONTENT_TRANSLATION_LOCALE_ALREADY_EXISTS: "该语言版本已存在，请使用现有翻译或选择其他语言。",
      INVALID_SESSION_ID: "未指定要退出的设备，请刷新后重试。",
      ORG_MEMBER_INVITE_ALREADY_PENDING: "该邮箱已有待处理邀请，无需重复发送。",
      PROJECT_DELETE_CONFIRM_NAME_MISMATCH: "输入的项目名称不一致，请输入完整项目名称后再删除。",
      PROJECT_RUNTIME_SITE_NOT_FOUND: "未找到与该项目运行环境关联的站点，请检查项目设置。",
      ROLE_TEMPLATE_NOT_FOUND: "未找到所选角色模板，请选择可用模板。",
    });
    expect(i18nResources["en-US"].errors).toMatchObject({
      AGENT_APPROVAL_NOT_FOUND: "We couldn't find that Agent approval. Refresh and try again.",
      API_KEY_SITE_MISMATCH:
        "This access key belongs to a different site. Use a key created for this site.",
      CONTENT_ITEM_SINGLE_TYPE_ALREADY_EXISTS:
        "This single-entry content model already has an item for this language. Edit the existing item.",
      CONTENT_TRANSLATION_LOCALE_ALREADY_EXISTS:
        "A translation for this language already exists. Use the existing translation or choose another language.",
      INVALID_SESSION_ID: "No device was selected to sign out. Refresh and try again.",
      ORG_MEMBER_INVITE_ALREADY_PENDING:
        "A pending invitation has already been sent to this email address.",
      PROJECT_DELETE_CONFIRM_NAME_MISMATCH:
        "The project name you entered does not match. Enter the exact project name to delete it.",
      PROJECT_RUNTIME_SITE_NOT_FOUND:
        "We couldn't find the site linked to this project environment. Check the project setup.",
      ROLE_TEMPLATE_NOT_FOUND:
        "We couldn't find the selected role template. Choose an available template.",
    });
  });
});
