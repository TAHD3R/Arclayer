import type {
  DesignMotionRoleV1,
  DesignSystemManifestInputV1,
  DesignSystemManifestV1,
  DesignThemeV1,
  DesignTokenDefinitionV1,
  DesignTypographyRoleV1,
} from "@arclayer/openapi";

export type DesignSystemFoundationValues = {
  manifestName: string;
  componentCatalogVersion: string;
  canvasColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  actionColor: string;
  actionTextColor: string;
  borderColor: string;
  focusColor: string;
  bodyFont: string;
  baseFontSize: string;
  motionDuration: string;
};

const DEFAULT_VALUES: DesignSystemFoundationValues = {
  manifestName: "Visitor site foundation",
  componentCatalogVersion: "",
  canvasColor: "#FFFFFF",
  primaryTextColor: "#111111",
  secondaryTextColor: "#595959",
  actionColor: "#155EEF",
  actionTextColor: "#FFFFFF",
  borderColor: "#D5D7DA",
  focusColor: "#155EEF",
  bodyFont: "Figtree",
  baseFontSize: "1rem",
  motionDuration: "180ms",
};

const FOUNDATION_COLORS = {
  canvasColor: "primitive.color.canvas",
  primaryTextColor: "primitive.color.ink",
  secondaryTextColor: "primitive.color.muted",
  actionColor: "primitive.color.action",
  actionTextColor: "primitive.color.on-action",
  borderColor: "primitive.color.border",
  focusColor: "primitive.color.focus",
} as const;

const SEMANTIC_COLOR_ALIASES: Record<string, string> = {
  "semantic.color.surface.canvas": FOUNDATION_COLORS.canvasColor,
  "semantic.color.text.primary": FOUNDATION_COLORS.primaryTextColor,
  "semantic.color.text.secondary": FOUNDATION_COLORS.secondaryTextColor,
  "semantic.color.action.primary": FOUNDATION_COLORS.actionColor,
  "semantic.color.action.on-primary": FOUNDATION_COLORS.actionTextColor,
  "semantic.color.border.default": FOUNDATION_COLORS.borderColor,
  "semantic.color.focus.ring": FOUNDATION_COLORS.focusColor,
};

export function designSystemFoundationDefaults(
  source?: DesignSystemManifestV1,
  defaultComponentCatalogVersion = "",
): DesignSystemFoundationValues {
  if (!source) {
    return { ...DEFAULT_VALUES, componentCatalogVersion: defaultComponentCatalogVersion };
  }
  const color = (path: string, fallback: string) => {
    const value = source.primitiveTokens?.[path]?.value;
    return typeof value === "string" ? value : fallback;
  };
  const family = source.primitiveTokens?.["primitive.font.family.body"]?.value;
  const fontSize = source.primitiveTokens?.["primitive.font.size.body"]?.value;
  const duration = source.primitiveTokens?.["primitive.motion.duration.standard"]?.value;
  return {
    manifestName: source.name,
    componentCatalogVersion: source.componentCatalogVersion ?? defaultComponentCatalogVersion,
    canvasColor: color(FOUNDATION_COLORS.canvasColor, DEFAULT_VALUES.canvasColor),
    primaryTextColor: color(FOUNDATION_COLORS.primaryTextColor, DEFAULT_VALUES.primaryTextColor),
    secondaryTextColor: color(
      FOUNDATION_COLORS.secondaryTextColor,
      DEFAULT_VALUES.secondaryTextColor,
    ),
    actionColor: color(FOUNDATION_COLORS.actionColor, DEFAULT_VALUES.actionColor),
    actionTextColor: color(FOUNDATION_COLORS.actionTextColor, DEFAULT_VALUES.actionTextColor),
    borderColor: color(FOUNDATION_COLORS.borderColor, DEFAULT_VALUES.borderColor),
    focusColor: color(FOUNDATION_COLORS.focusColor, DEFAULT_VALUES.focusColor),
    bodyFont:
      Array.isArray(family) && typeof family[0] === "string" ? family[0] : DEFAULT_VALUES.bodyFont,
    baseFontSize: typeof fontSize === "string" ? fontSize : DEFAULT_VALUES.baseFontSize,
    motionDuration: typeof duration === "string" ? duration : DEFAULT_VALUES.motionDuration,
  };
}

export function validateDesignSystemFoundationValues(
  values: DesignSystemFoundationValues,
): Partial<Record<keyof DesignSystemFoundationValues, "required" | "format">> {
  const errors: Partial<Record<keyof DesignSystemFoundationValues, "required" | "format">> = {};
  if (!values.manifestName.trim()) errors.manifestName = "required";
  if (!values.componentCatalogVersion.trim()) errors.componentCatalogVersion = "required";
  if (!values.bodyFont.trim()) errors.bodyFont = "required";
  for (const key of Object.keys(FOUNDATION_COLORS) as Array<keyof typeof FOUNDATION_COLORS>) {
    if (!/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(values[key])) errors[key] = "format";
  }
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:px|rem|em|%)$/.test(values.baseFontSize)) {
    errors.baseFontSize = "format";
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?(?:ms|s)$/.test(values.motionDuration)) {
    errors.motionDuration = "format";
  }
  return errors;
}

export function buildDesignSystemFoundationManifest(
  values: DesignSystemFoundationValues,
  source?: DesignSystemManifestV1,
): DesignSystemManifestInputV1 {
  const sourceInput = withoutChecksum(source);
  const primitiveTokens = { ...sourceInput?.primitiveTokens };
  for (const [field, path] of Object.entries(FOUNDATION_COLORS) as Array<
    [keyof typeof FOUNDATION_COLORS, string]
  >) {
    primitiveTokens[path] = token("color", values[field].toUpperCase(), primitiveTokens[path]);
  }
  primitiveTokens["primitive.font.family.body"] = token(
    "font-family",
    [values.bodyFont.trim(), "sans-serif"],
    primitiveTokens["primitive.font.family.body"],
  );
  primitiveTokens["primitive.font.weight.regular"] = token(
    "font-weight",
    400,
    primitiveTokens["primitive.font.weight.regular"],
  );
  primitiveTokens["primitive.font.size.body"] = token(
    "dimension",
    values.baseFontSize,
    primitiveTokens["primitive.font.size.body"],
  );
  primitiveTokens["primitive.font.line-height.body"] = token(
    "number",
    1.5,
    primitiveTokens["primitive.font.line-height.body"],
  );
  primitiveTokens["primitive.motion.duration.standard"] = token(
    "duration",
    values.motionDuration,
    primitiveTokens["primitive.motion.duration.standard"],
  );
  primitiveTokens["primitive.motion.duration.reduced"] = token(
    "duration",
    "0ms",
    primitiveTokens["primitive.motion.duration.reduced"],
  );
  primitiveTokens["primitive.motion.easing.standard"] = token(
    "cubic-bezier",
    [0.2, 0.8, 0.2, 1],
    primitiveTokens["primitive.motion.easing.standard"],
  );

  const semanticTokens = { ...sourceInput?.semanticTokens };
  for (const [path, alias] of Object.entries(SEMANTIC_COLOR_ALIASES)) {
    semanticTokens[path] = {
      ...semanticTokens[path],
      type: "color",
      value: null,
      alias,
    };
  }

  return {
    ...sourceInput,
    manifestVersion: 1,
    name: values.manifestName.trim(),
    primitiveTokens,
    semanticTokens,
    componentTokens: sourceInput?.componentTokens ?? {},
    themes: ensureLightTheme(sourceInput?.themes),
    typographyRoles: upsertByKey(sourceInput?.typographyRoles, bodyTypographyRole()),
    componentRecipes: sourceInput?.componentRecipes ?? [],
    motionTokens: upsertByKey(sourceInput?.motionTokens, standardMotionRole()),
    breakpoints: sourceInput?.breakpoints ?? { tablet: "48rem", desktop: "80rem" },
    assetReferences: sourceInput?.assetReferences ?? [],
    componentCatalogVersion: values.componentCatalogVersion.trim() || null,
    extensions: sourceInput?.extensions ?? {},
  };
}

function withoutChecksum(source?: DesignSystemManifestV1): DesignSystemManifestInputV1 | undefined {
  if (!source) return undefined;
  const { checksum: _checksum, ...manifest } = source;
  return manifest as unknown as DesignSystemManifestInputV1;
}

function token(
  type: DesignTokenDefinitionV1["type"],
  value: NonNullable<DesignTokenDefinitionV1["value"]>,
  source?: DesignTokenDefinitionV1,
): DesignTokenDefinitionV1 {
  return { ...source, type, value, alias: null };
}

function ensureLightTheme(themes?: DesignThemeV1[]): DesignThemeV1[] {
  if (themes?.some((theme) => theme.mode === "light")) return themes;
  return [{ key: "light", name: "Light", mode: "light", overrides: {} }, ...(themes ?? [])];
}

function bodyTypographyRole(): DesignTypographyRoleV1 {
  return {
    key: "body",
    name: "Body",
    fontFamilyToken: "primitive.font.family.body",
    fontWeightToken: "primitive.font.weight.regular",
    fontSizeToken: "primitive.font.size.body",
    lineHeightToken: "primitive.font.line-height.body",
    letterSpacingToken: null,
  };
}

function standardMotionRole(): DesignMotionRoleV1 {
  return {
    key: "standard",
    name: "Standard transition",
    durationToken: "primitive.motion.duration.standard",
    easingToken: "primitive.motion.easing.standard",
    reducedMotionDurationToken: "primitive.motion.duration.reduced",
  };
}

function upsertByKey<T extends { key: string }>(items: T[] | undefined, item: T): T[] {
  const existing = items ?? [];
  return [...existing.filter((candidate) => candidate.key !== item.key), item];
}
