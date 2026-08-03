import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("Platform login design contract", () => {
  it("keeps the official login-05 page structure", () => {
    const page = source("pages/platform-sign-in.tsx");

    expect(page).toContain("min-h-svh");
    expect(page).toContain("grid-rows-[2.5rem_minmax(0,1fr)_2.5rem]");
    expect(page).toContain("<header");
    expect(page).toContain("<PlatformLoginLogo />");
    expect(page).toContain("<section");
    expect(page).toContain("w-full max-w-sm");
    expect(page).toContain("<PlatformLoginBackground />");
    expect(page).toContain("<PlatformLoginForm />");
    expect(page).toContain("<footer");
    expect(page).toContain("<PlatformLoginPreferences />");
    expect(page).not.toContain("PlatformAuthLayout");
  });

  it("uses only local standard Shadcn primitives on the login form", () => {
    const form = source("components/platform-login-form.tsx");
    const steps = source("components/platform-login-steps.tsx");
    const loginSource = `${form}\n${steps}`;

    expect(loginSource).toContain('from "@/components/ui/button"');
    expect(loginSource).toContain('from "@/components/ui/field"');
    expect(loginSource).toContain('from "@/components/ui/input"');
    expect(loginSource).toContain('from "@/components/ui/input-group"');
    expect(loginSource).not.toContain("@arclayer/ui");
    expect(loginSource).not.toContain("ProductApplicationLink");
    expect(loginSource).not.toContain("LocaleMenu");
    expect(loginSource).not.toContain("ThemeMenu");
    expect(loginSource).not.toContain("PlatformLoginLogo");
    expect(loginSource).not.toContain("PlatformLoginPreferences");
    expect(loginSource).not.toContain("Continue with Apple");
    expect(loginSource).not.toContain("Continue with Google");
  });

  it("keeps the product logo, Aurora background, and preferences local to Platform", () => {
    const visuals = source("components/platform-login-visuals.tsx");
    const accessEn = readFileSync(resolve(process.cwd(), "locales/en-US/access.json"), "utf8");
    const accessZh = readFileSync(resolve(process.cwd(), "locales/zh-CN/access.json"), "utf8");

    expect(visuals).toContain(
      'src={resolvedTheme === "dark" ? "/logo-full-dark.svg" : "/logo-full.svg"}',
    );
    expect(visuals).toContain("<PlatformAurora");
    expect(visuals).toContain("export function PlatformLoginPreferences");
    expect(visuals).toContain('from "@/components/ui/button"');
    expect(visuals).toContain('from "@/components/ui/separator"');
    expect(visuals).not.toContain("@arclayer/ui");
    expect(accessEn).not.toContain("ADMIN_ONLY");
    expect(accessEn).not.toContain("ADMIN_ACCESS_NOTICE");
    expect(accessZh).not.toContain("ADMIN_ONLY");
    expect(accessZh).not.toContain("ADMIN_ACCESS_NOTICE");
    expect(accessEn).toContain('"SIGN_IN_TITLE": "Welcome back"');
    expect(accessEn).toContain('"SIGN_IN_DESCRIPTION": "Structured content, visually built."');
    expect(accessZh).toContain('"SIGN_IN_TITLE": "欢迎回来"');
    expect(accessZh).toContain('"SIGN_IN_DESCRIPTION": "结构化内容，可视化构建。"');
  });
});
