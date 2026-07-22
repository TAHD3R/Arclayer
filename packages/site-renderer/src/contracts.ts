import type {
  BuilderPageRenderDocumentOut,
  BuilderRenderSectionOut,
  BuilderRenderSlotOut,
  JsonValueOutput,
} from "@arclayer/openapi";

export const SITE_RENDERER_PROFILE = "arclayer-site-v1" as const;
export const SITE_RENDERER_VERSION = "1.0.0" as const;

export type SiteRenderDocument = BuilderPageRenderDocumentOut;
export type SiteRenderSection = BuilderRenderSectionOut;
export type SiteRenderSlot = BuilderRenderSlotOut;

export type SiteInteraction = Readonly<{
  action: "navigate" | "submit" | "open";
  target?: string;
  section: SiteRenderSection;
}>;

export class SiteRendererContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SiteRendererContractError";
    this.code = code;
  }
}

export function assertRenderDocument(document: SiteRenderDocument): void {
  if (
    document.renderer.profile !== SITE_RENDERER_PROFILE ||
    document.renderer.version !== SITE_RENDERER_VERSION ||
    document.renderable !== true
  ) {
    throw new SiteRendererContractError(
      "SITE_RENDERER_DOCUMENT_UNSUPPORTED",
      `Unsupported renderer contract ${document.renderer.profile}@${document.renderer.version}`,
    );
  }
}

export function slotByKey(section: SiteRenderSection, key: string): SiteRenderSlot | undefined {
  return section.slots.find((slot) => slot.key === key);
}

export function requiredStringSlot(section: SiteRenderSection, key: string): string {
  const slot = slotByKey(section, key);
  if (!slot || typeof slot.value !== "string" || !slot.value.trim()) {
    throw invalidSlot(section, key);
  }
  return slot.value;
}

export function optionalStringSlot(section: SiteRenderSection, key: string): string | undefined {
  const slot = slotByKey(section, key);
  if (!slot) return undefined;
  if (typeof slot.value !== "string" || !slot.value.trim()) throw invalidSlot(section, key);
  return slot.value;
}

export type RenderImage = Readonly<{ src: string; alt?: string }>;

export function optionalImageSlot(
  section: SiteRenderSection,
  key: string,
): RenderImage | undefined {
  const slot = slotByKey(section, key);
  if (!slot) return undefined;
  const value = slot.value;
  if (!isObject(value) || typeof value.src !== "string" || !value.src.trim()) {
    throw invalidSlot(section, key);
  }
  if (value.alt !== undefined && typeof value.alt !== "string") throw invalidSlot(section, key);
  return { src: value.src, ...(typeof value.alt === "string" ? { alt: value.alt } : {}) };
}

export function requiredImageSlot(section: SiteRenderSection, key: string): RenderImage {
  const value = optionalImageSlot(section, key);
  if (!value) throw invalidSlot(section, key);
  return value;
}

export type RenderAction = Readonly<{
  label: string;
  action: "navigate" | "submit" | "open";
  target?: string;
}>;

export function optionalActionSlot(
  section: SiteRenderSection,
  key: string,
): RenderAction | undefined {
  const slot = slotByKey(section, key);
  if (!slot) return undefined;
  const value = slot.value;
  if (
    !isObject(value) ||
    typeof value.label !== "string" ||
    !value.label.trim() ||
    !isAction(value.action) ||
    (value.target !== undefined && typeof value.target !== "string")
  ) {
    throw invalidSlot(section, key);
  }
  return {
    label: value.label,
    action: value.action,
    ...(typeof value.target === "string" ? { target: value.target } : {}),
  };
}

export function requiredActionSlot(section: SiteRenderSection, key: string): RenderAction {
  const value = optionalActionSlot(section, key);
  if (!value) throw invalidSlot(section, key);
  return value;
}

export type RenderListItem = Readonly<{
  label?: string;
  title?: string;
  body?: string;
  href?: string;
  image?: string;
}>;

export function optionalListSlot(
  section: SiteRenderSection,
  key: string,
): readonly RenderListItem[] {
  const slot = slotByKey(section, key);
  if (!slot) return [];
  if (!Array.isArray(slot.value)) throw invalidSlot(section, key);
  return slot.value.map((item) => {
    if (!isObject(item)) throw invalidSlot(section, key);
    const result: Record<string, string> = {};
    for (const itemKey of ["label", "title", "body", "href", "image"] as const) {
      const value = item[itemKey];
      if (value !== undefined && typeof value !== "string") throw invalidSlot(section, key);
      if (typeof value === "string") result[itemKey] = value;
    }
    if (!result.label && !result.title) throw invalidSlot(section, key);
    return result;
  });
}

export function requiredListSlot(
  section: SiteRenderSection,
  key: string,
): readonly RenderListItem[] {
  const slot = slotByKey(section, key);
  if (!slot) throw invalidSlot(section, key);
  return optionalListSlot(section, key);
}

function isObject(value: JsonValueOutput): value is Record<string, JsonValueOutput> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAction(value: JsonValueOutput | undefined): value is RenderAction["action"] {
  return value === "navigate" || value === "submit" || value === "open";
}

function invalidSlot(section: SiteRenderSection, key: string): SiteRendererContractError {
  return new SiteRendererContractError(
    "SITE_RENDERER_SLOT_INVALID",
    `Invalid ${section.componentKey}.${key} slot in section ${section.instanceId}`,
  );
}
