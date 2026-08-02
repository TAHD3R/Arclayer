import { describe, expect, it } from "vitest";

import { i18nResources } from "@/lib/i18n/resources";
import enSys from "@locales/en-US/sys.json";
import zhSys from "@locales/zh-CN/sys.json";

type CopyEntry = Readonly<{ path: string; value: string }>;

const CHINESE_COPY_ALLOWED_TO_BE_ENGLISH = new Set([
  "ai.AI_CHAT_MODEL_DEEPSEEK_V4_PRO",
  "ai.AI_CHAT_MODEL_GPT_4O_MINI",
  "ai.AI_CHAT_MODEL_CLAUDE_SONNET",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_EDITORIAL_STUDIO_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_SAAS_LAUNCH_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_ARCHITECTURE_INDEX_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_HOSPITALITY_ROOM_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_WORKSPACE_HUB_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_COMMERCE_ATELIER_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_AGENCY_REPORT_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_TRAVEL_JOURNAL_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_CITY_EVENTS_NAME",
  "ai.AI_CHAT_HOME_INSPIRATION_TEMPLATE_REAL_ESTATE_NAME",
  "nav.NAV_MARKETING_GOOGLE_ADS",
  "nav.NAV_GOOGLE_ANALYTICS",
  "settings.SETTINGS_MESSAGING_MAIL_PROVIDER_SES",
  "settings.SETTINGS_SITE_NAME_PLACEHOLDER",
  "settings.SETTINGS_STORAGE_PROVIDER_AWS_S3",
  "settings.SETTINGS_STORAGE_PROVIDER_CLOUDFLARE_R2",
  "settings.SETTINGS_STORAGE_S3_ACCESS_KEY_ID_LABEL",
  "settings.SETTINGS_STORAGE_S3_SECRET_ACCESS_KEY_LABEL",
]);
const INTENTIONAL_EMPTY_COPY = new Set(["setup.SETUP_TEMPLATE_BLANK_DESC"]);
const MACHINE_TRANSLATION_RESIDUE =
  /twofactor|not不存在|not归档|not已发布|fieldorder|impact预览|query必填|transferimport|validationfailed|primaryrecord|routenot|aliasnot|copytarget|jobnot|jobretry|templatenot|onboardingcompleted|onboardingstate|tenantnot|capability_id|presencevalkey|resolvedb|邮箱same|generatefailed|generationfailed|deleteconfirm|systemimmutable|username(?:存在|必填)|reset(?:存储|令牌)|current会话|menunot|db必填/i;

function flattenStrings(value: unknown, prefix = ""): CopyEntry[] {
  if (typeof value === "string") return [{ path: prefix, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenStrings(item, `${prefix}.${index}`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    flattenStrings(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function placeholders(value: string): string[] {
  return [...(value.match(/{{[^{}]+}}|{[^{}]+}|<\/?[a-z][^>]*>/gi) ?? [])].sort();
}

describe("Admin Product copy quality", () => {
  it("keeps every namespace complete, bilingual, and placeholder-safe", () => {
    const zhResources = { ...i18nResources["zh-CN"], sys: zhSys };
    const enResources = { ...i18nResources["en-US"], sys: enSys };
    const zhEntries = flattenStrings(zhResources);
    const enEntries = flattenStrings(enResources);
    const enByPath = new Map(enEntries.map((entry) => [entry.path, entry.value]));

    expect(Object.keys(zhResources).sort()).toEqual(Object.keys(enResources).sort());
    expect(zhEntries.map((entry) => entry.path).sort()).toEqual(
      enEntries.map((entry) => entry.path).sort(),
    );

    const emptyCopy: string[] = [];
    const chineseCopyContainingOnlyEnglish: string[] = [];
    const englishCopyContainingChinese: string[] = [];
    const inconsistentTerminology: string[] = [];
    const machineTranslationResidue: string[] = [];
    const placeholderMismatches: string[] = [];
    const rawKeyCopy: string[] = [];

    for (const { path, value: zhCopy } of zhEntries) {
      const enCopy = enByPath.get(path);
      expect(enCopy).toBeDefined();
      if (!zhCopy.trim() && !INTENTIONAL_EMPTY_COPY.has(path)) emptyCopy.push(`zh-CN:${path}`);
      if (!enCopy?.trim() && !INTENTIONAL_EMPTY_COPY.has(path)) emptyCopy.push(`en-US:${path}`);
      if (
        !/[一-龥]/.test(zhCopy) &&
        /[A-Za-z]+\s+[A-Za-z]+/.test(zhCopy) &&
        !CHINESE_COPY_ALLOWED_TO_BE_ENGLISH.has(path)
      ) {
        chineseCopyContainingOnlyEnglish.push(path);
      }
      if (enCopy && /[一-龥]/.test(enCopy)) englishCopyContainingChinese.push(path);
      if (
        /智能体|工作区|双重验证|多因素验证|多重身份验证|(?:^|[^A-Za-z])2FA(?:[^A-Za-z]|$)/.test(
          zhCopy,
        )
      ) {
        inconsistentTerminology.push(`zh-CN:${path}`);
      }
      if (
        enCopy &&
        (/\bagents?\b/.test(enCopy) ||
          /\b(?:2FA|TOTP|two-factor|step-up|multi-factor authentication)\b/i.test(enCopy))
      ) {
        inconsistentTerminology.push(`en-US:${path}`);
      }
      if (MACHINE_TRANSLATION_RESIDUE.test(zhCopy)) machineTranslationResidue.push(path);
      const leafKey = path.split(".").at(-1);
      if (leafKey && (zhCopy === leafKey || enCopy === leafKey)) rawKeyCopy.push(path);
      if (enCopy && JSON.stringify(placeholders(zhCopy)) !== JSON.stringify(placeholders(enCopy))) {
        placeholderMismatches.push(path);
      }
    }

    expect(emptyCopy).toEqual([]);
    expect(chineseCopyContainingOnlyEnglish).toEqual([]);
    expect(englishCopyContainingChinese).toEqual([]);
    expect(inconsistentTerminology).toEqual([]);
    expect(machineTranslationResidue).toEqual([]);
    expect(placeholderMismatches).toEqual([]);
    expect(rawKeyCopy).toEqual([]);
  });
});
