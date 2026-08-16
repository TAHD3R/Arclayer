import { expect, test } from "@playwright/test";

import {
  PRODUCT_ORIGIN,
  expectNoPageHorizontalOverflow,
  getBrowserAcceptanceFixture,
  platformUrl,
  productUrl,
  signInToPlatform,
  signInToProduct,
} from "@arclayer/browser-acceptance";

test.use({ colorScheme: "light", locale: "en-US", viewport: { width: 1280, height: 900 } });
test.slow();

test("Platform Console enforces independent MFA Sessions, canonical routes, and real session revocation", async ({
  browser,
}) => {
  const productContext = await browser.newContext({ colorScheme: "light", locale: "en-US" });
  const productPage = await productContext.newPage();
  await signInToProduct(productPage);
  await productPage.goto(productUrl("/customization/knowledge"));
  await expect(productPage.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();

  const currentContext = await browser.newContext({ colorScheme: "light", locale: "en-US" });
  const currentPage = await currentContext.newPage();
  const fixture = await getBrowserAcceptanceFixture();
  await currentPage.goto(platformUrl("/sign-in"));
  await currentPage.getByLabel("Email or username").fill(fixture.platform.identifier);
  await currentPage.getByLabel("Password").fill("not-the-fixture-password1");
  await currentPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(currentPage.getByRole("alert")).toBeVisible();

  await signInToPlatform(currentPage);
  await expect(currentPage.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

  for (const [path, heading] of [
    ["/attention", "Needs attention"],
    ["/workspaces", "Workspaces"],
    ["/ai/tasks", "AI tasks"],
  ] as const) {
    await currentPage.goto(platformUrl(path));
    await expect(currentPage).toHaveURL(platformUrl(path));
    await expect(currentPage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    for (const width of [1280, 768, 375, 640, 320]) {
      await currentPage.setViewportSize({ width, height: 900 });
      await expectNoPageHorizontalOverflow(currentPage);
    }
  }

  await currentPage.setViewportSize({ width: 1280, height: 900 });
  await currentPage.goto(platformUrl("/"));
  await currentPage.getByRole("button", { name: "Open administrator menu" }).click();
  await currentPage.getByRole("menuitem", { name: "Account settings" }).click();
  await currentPage.getByRole("button", { name: "Appearance & language" }).click();
  await currentPage.getByRole("button", { name: "Dark", exact: true }).click();
  await expect
    .poll(() => currentPage.locator("html").evaluate((html) => html.classList.contains("dark")))
    .toBe(true);
  await currentPage.emulateMedia({ colorScheme: "light" });
  await currentPage.getByRole("button", { name: "Light", exact: true }).click();
  await expect
    .poll(() => currentPage.locator("html").evaluate((html) => html.classList.contains("dark")))
    .toBe(false);
  await currentPage.emulateMedia({ colorScheme: "dark" });
  await currentPage.getByRole("button", { name: "Use system setting", exact: true }).click();
  await expect
    .poll(() => currentPage.locator("html").evaluate((html) => html.classList.contains("dark")))
    .toBe(true);

  await currentPage.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(currentPage.getByRole("heading", { name: "总览", exact: true })).toBeVisible();
  await currentPage.getByRole("button", { name: "English", exact: true }).click();
  await expect(currentPage.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

  const revokedContext = await browser.newContext({ colorScheme: "light", locale: "en-US" });
  const revokedPage = await revokedContext.newPage();
  await signInToPlatform(revokedPage);
  await expect(revokedPage.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();

  await currentPage.getByRole("button", { name: "Signed-in devices", exact: true }).click();
  const revokeOthers = currentPage.getByRole("button", {
    name: "Revoke other sessions",
    exact: true,
  });
  await expect(revokeOthers).toBeEnabled();
  await revokeOthers.focus();
  await expect(revokeOthers).toBeFocused();
  await currentPage.keyboard.press("Enter");
  const dialog = currentPage.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Revoke session", exact: true });
  await expect(confirm).toBeVisible();
  await confirm.focus();
  await expect(confirm).toBeFocused();
  await currentPage.keyboard.press("Enter");
  await expect(currentPage.getByRole("status")).toContainText(
    "The other device sessions were revoked",
  );

  await revokedPage.goto(platformUrl("/"));
  await expect(
    revokedPage.getByRole("heading", { name: "Sign in to the Platform Console", exact: true }),
  ).toBeVisible();
  await expect(revokedPage.getByText("Your Platform access on this device ended")).toBeVisible();

  await currentPage.goto(platformUrl("/"));
  await expect(currentPage.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await productPage.goto(productUrl("/customization/knowledge"));
  await expect(productPage.getByRole("heading", { name: "Knowledge", exact: true })).toBeVisible();
  await expect(productPage).not.toHaveURL(/\/login\//u);
  await expect(productPage).toHaveURL(new RegExp(`^${PRODUCT_ORIGIN}`));

  await revokedContext.close();
  await currentContext.close();
  await productContext.close();
});

test("Platform AI operations pages expose real states and remain usable across viewports", async ({
  page,
}) => {
  await signInToPlatform(page);

  for (const [path, heading] of [
    ["/ai/tasks", "AI tasks"],
    ["/ai/assistants", "Built-in assistants"],
    ["/ai/skills", "Built-in skills"],
    ["/ai/policies", "Assistant policies"],
    ["/monitoring/ai-usage", "AI usage"],
  ] as const) {
    await page.goto(platformUrl(path));
    await expect(page).toHaveURL(platformUrl(path));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    for (const width of [1280, 768, 375, 640, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoPageHorizontalOverflow(page);
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(platformUrl("/ai/skills"));
  const search = page.getByPlaceholder("Search built-in skills");
  await expect(search).toBeVisible();
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
