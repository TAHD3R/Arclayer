import { expect, test } from "@playwright/test";

import {
  PLATFORM_ORIGIN,
  expectNoPageHorizontalOverflow,
  getBrowserAcceptanceFixture,
  productUrl,
  signInToProduct,
} from "../../../../tests/browser/support";

test.use({ colorScheme: "light", locale: "en-US", viewport: { width: 1280, height: 900 } });

test("Product Application keeps real sign-in recovery, hard-cut customization routes, and independent Platform entry", async ({
  page,
}) => {
  await page.goto(productUrl("/login/"));

  await page.getByLabel("Color mode").click();
  await page.getByRole("option", { name: "Dark mode", exact: true }).click();
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByLabel("Color mode").click();
  await page.getByRole("option", { name: "Follow system", exact: true }).click();
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("light");

  await page.getByLabel("Interface language").click();
  await page.getByRole("option", { name: "简体中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "嗨，欢迎回来！", exact: true })).toBeVisible();
  await page.getByLabel("界面语言").click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hi, Welcome back!", exact: true })).toBeVisible();

  const fixture = await getBrowserAcceptanceFixture();
  await page.getByLabel("Email").fill(fixture.product.email);
  await page.getByLabel("Password").fill("not-the-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
  await signInToProduct(page);

  for (const [path, heading] of [
    ["/customization/knowledge", "Knowledge"],
    ["/customization/design-systems", "Design systems"],
  ] as const) {
    await page.goto(productUrl(path));
    await expect(page).toHaveURL(productUrl(path));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    for (const width of [1280, 768, 375, 640, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoPageHorizontalOverflow(page);
    }
  }

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  await page.goto(`${PLATFORM_ORIGIN}/`);
  await expect(
    page.getByRole("heading", { name: "Sign in to the Platform Console", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Email or username")).toBeEmpty();
  await expect(page.getByLabel("Password")).toBeEmpty();

  await page.goto(productUrl("/customization/knowledge"));
  await expect(page.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login\//u);
});
