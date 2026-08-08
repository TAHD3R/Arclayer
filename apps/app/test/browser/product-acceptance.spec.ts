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

  const fixture = await getBrowserAcceptanceFixture();
  await page.getByLabel("Email address", { exact: true }).fill(fixture.product.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-fixture-password1");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(
    page.getByText("Email address or password is incorrect. Check it and try again.", {
      exact: true,
    }),
  ).toBeVisible();
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
  await expect(page.getByLabel("Email or username", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();

  await page.goto(productUrl("/customization/knowledge"));
  await expect(page.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login\//u);
});
