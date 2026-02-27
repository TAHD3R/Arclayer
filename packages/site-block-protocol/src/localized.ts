export type LocaleCode = "zh-CN" | "en-US" | (string & {});

/**
 * Field-level i18n map.
 *
 * Example:
 * - { "zh-CN": "你好", "en-US": "Hello" }
 */
export type LocalizedValue<T> = Partial<Record<LocaleCode, T>>;

export type LocalizedString = LocalizedValue<string>;

export interface ViewerContextLikeForI18n {
  locale: LocaleCode;
  fallbackLocale?: LocaleCode;
}

export function resolveLocalizedValue<T>(
  value: LocalizedValue<T> | undefined,
  ctx: ViewerContextLikeForI18n,
): T | undefined {
  if (!value) return undefined;
  const direct = value[ctx.locale];
  if (direct !== undefined) return direct;
  if (ctx.fallbackLocale) {
    const fallback = value[ctx.fallbackLocale];
    if (fallback !== undefined) return fallback;
  }
  // Pick a deterministic "first" locale entry if present.
  const entries = Object.entries(value) as Array<[string, T]>;
  return entries.length ? entries[0]![1] : undefined;
}
