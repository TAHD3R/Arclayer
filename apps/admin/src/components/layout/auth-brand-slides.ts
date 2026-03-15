export type AuthBrandSlide = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  imageSrc: string;
};

export const AUTH_BRAND_SLIDES: readonly AuthBrandSlide[] = [
  {
    id: "schema",
    titleKey: "auth:AUTH_BRAND_SLIDE_SCHEMA_TITLE",
    descriptionKey: "auth:AUTH_BRAND_SLIDE_SCHEMA_DESC",
    imageSrc: "/promotion/promotion-001.jpg",
  },
  {
    id: "compose",
    titleKey: "auth:AUTH_BRAND_SLIDE_COMPOSE_TITLE",
    descriptionKey: "auth:AUTH_BRAND_SLIDE_COMPOSE_DESC",
    imageSrc: "/promotion/promotion-002.jpg",
  },
  {
    id: "publish",
    titleKey: "auth:AUTH_BRAND_SLIDE_PUBLISH_TITLE",
    descriptionKey: "auth:AUTH_BRAND_SLIDE_PUBLISH_DESC",
    imageSrc: "/promotion/promotion-003.jpg",
  },
] as const;
