import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachPlatformCsrfToken } from "@/api/client";

function expireCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/`;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  expireCookie("csrf_token");
  expireCookie("platform_csrf_token");
  expireCookie("custom_platform_csrf");
});

describe("Platform API CSRF transport", () => {
  it("uses only the independent Platform cookie for unsafe requests", () => {
    document.cookie = "csrf_token=product-token; Path=/";
    document.cookie = "platform_csrf_token=platform-token; Path=/";

    const request = attachPlatformCsrfToken(
      new Request("https://platform.example/platform-api/v1/commerce/provider", {
        method: "PUT",
      }),
    );

    expect(request.headers.get("X-CSRF-Token")).toBe("platform-token");
  });

  it("never substitutes the Product CSRF cookie", () => {
    document.cookie = "csrf_token=product-token; Path=/";

    const request = attachPlatformCsrfToken(
      new Request("https://platform.example/platform-api/v1/commerce/provider", {
        method: "PUT",
      }),
    );

    expect(request.headers.has("X-CSRF-Token")).toBe(false);
  });

  it("does not attach a CSRF header to safe requests", () => {
    document.cookie = "platform_csrf_token=platform-token; Path=/";

    const request = attachPlatformCsrfToken(
      new Request("https://platform.example/platform-api/v1/commerce/provider", {
        method: "GET",
      }),
    );

    expect(request.headers.has("X-CSRF-Token")).toBe(false);
  });

  it("supports an explicitly configured Platform cookie name", () => {
    vi.stubEnv("VITE_PLATFORM_CSRF_COOKIE_NAME", "custom_platform_csrf");
    document.cookie = "platform_csrf_token=default-token; Path=/";
    document.cookie = "custom_platform_csrf=custom-token; Path=/";

    const request = attachPlatformCsrfToken(
      new Request("https://platform.example/platform-api/v1/commerce/provider", {
        method: "PUT",
      }),
    );

    expect(request.headers.get("X-CSRF-Token")).toBe("custom-token");
  });
});
