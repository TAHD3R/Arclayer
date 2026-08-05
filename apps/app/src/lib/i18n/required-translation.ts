import type { i18n as I18nInstance } from "i18next";

export function requiredTranslation(
  i18n: I18nInstance,
  resourceKey: string,
  context: string,
): string {
  const normalizedKey = resourceKey.trim();
  if (!normalizedKey || !i18n.exists(normalizedKey)) {
    throw new Error(`Missing translation for ${context}: ${resourceKey}`);
  }
  const translated = i18n.t(normalizedKey);
  if (typeof translated !== "string" || !translated.trim() || translated === normalizedKey) {
    throw new Error(`Invalid translation for ${context}: ${resourceKey}`);
  }
  return translated;
}
