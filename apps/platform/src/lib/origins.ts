export type ProductApplicationTarget = "home";

const PRODUCT_APPLICATION_PATHS: Readonly<Record<ProductApplicationTarget, string>> = {
  home: "/",
};

function parseConfiguredOrigin(value: string): URL {
  const origin = new URL(value);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new Error("Platform Product Application origin must use HTTP or HTTPS");
  }
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new Error("Platform Product Application origin must not contain credentials or a path");
  }
  return origin;
}

export function getProductApplicationUrl(target: ProductApplicationTarget): string {
  const origin = parseConfiguredOrigin(import.meta.env.VITE_PRODUCT_APP_ORIGIN);
  return new URL(PRODUCT_APPLICATION_PATHS[target], origin).toString();
}
