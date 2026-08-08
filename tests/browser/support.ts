import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

export const PRODUCT_ORIGIN =
  process.env.BROWSER_ACCEPTANCE_PRODUCT_ORIGIN ?? "https://app.arclayer.localhost";
export const PLATFORM_ORIGIN =
  process.env.BROWSER_ACCEPTANCE_PLATFORM_ORIGIN ?? "https://platform.arclayer.localhost";

type BrowserAcceptanceFixture = Readonly<{
  product: Readonly<{ email: string; password: string; workspaceId: string; projectId: string }>;
  platform: Readonly<{ identifier: string; password: string; totpSecret: string }>;
}>;

let fixturePromise: Promise<BrowserAcceptanceFixture> | undefined;

export function productUrl(pathname: string): string {
  return new URL(pathname, PRODUCT_ORIGIN).toString();
}

export function platformUrl(pathname: string): string {
  return new URL(pathname, PLATFORM_ORIGIN).toString();
}

export function getBrowserAcceptanceFixture(): Promise<BrowserAcceptanceFixture> {
  fixturePromise ??= readFile(
    process.env.BROWSER_ACCEPTANCE_FIXTURE_PATH ?? "/tmp/arclayer-browser-acceptance/fixture.json",
    "utf8",
  ).then((value) => JSON.parse(value) as BrowserAcceptanceFixture);
  return fixturePromise;
}

export async function signInToProduct(page: Page): Promise<void> {
  const fixture = await getBrowserAcceptanceFixture();
  await page.goto(productUrl("/login/"));
  await page.getByLabel("Email address", { exact: true }).fill(fixture.product.email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(fixture.product.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login\//u);
}

export async function signInToPlatform(page: Page): Promise<void> {
  const fixture = await getBrowserAcceptanceFixture();
  await page.goto(platformUrl("/sign-in"));
  await page.getByLabel("Email or username").fill(fixture.platform.identifier);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(fixture.platform.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const codeInput = page.getByLabel("Verification code");
  await expect(codeInput).toBeVisible();
  await codeInput.fill(generateTotpCode(fixture.platform.totpSecret));
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/u);
}

export async function expectNoPageHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}

function generateTotpCode(secret: string, now = Date.now()): string {
  const normalized = secret.replace(/\s+/gu, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of normalized) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Invalid browser acceptance TOTP secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  const counter = Math.floor(now / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", bytes).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}
