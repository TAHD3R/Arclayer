import { beforeAll, describe, expect, it } from "vitest";

import { i18n, initializePlatformI18n, PLATFORM_LOCALES } from "@/lib/i18n";

type CopyEntry = Readonly<{ path: string; value: string }>;

const ENGLISH_COPY_ALLOWED_TO_CONTAIN_CHINESE = new Set(["common.LANGUAGE_ZH_CN"]);
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

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

describe("Platform Product copy quality", () => {
  it("keeps every namespace complete, bilingual, and placeholder-safe", () => {
    const namespaces = Array.isArray(i18n.options.ns) ? i18n.options.ns : [i18n.options.ns];
    const [zhLocale, enLocale] = PLATFORM_LOCALES;
    const zhEntries = namespaces.flatMap((namespace) =>
      flattenStrings(i18n.getResourceBundle(zhLocale, namespace), namespace),
    );
    const enEntries = namespaces.flatMap((namespace) =>
      flattenStrings(i18n.getResourceBundle(enLocale, namespace), namespace),
    );
    const enByPath = new Map(enEntries.map((entry) => [entry.path, entry.value]));

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
      if (!zhCopy.trim()) emptyCopy.push(`zh-CN:${path}`);
      if (!enCopy?.trim()) emptyCopy.push(`en-US:${path}`);
      if (!/[一-龥]/.test(zhCopy) && /[A-Za-z]+\s+[A-Za-z]+/.test(zhCopy)) {
        chineseCopyContainingOnlyEnglish.push(path);
      }
      if (enCopy && /[一-龥]/.test(enCopy) && !ENGLISH_COPY_ALLOWED_TO_CONTAIN_CHINESE.has(path)) {
        englishCopyContainingChinese.push(path);
      }
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
