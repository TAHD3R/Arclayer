export type PublishedComponentRenderer = (payload: unknown) => string;

export const componentRegistry: Record<string, PublishedComponentRenderer> = {
  hero_banner: () => "hero_banner",
};
