import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

export const PRODUCT_ORIGIN =
  process.env.BROWSER_ACCEPTANCE_PRODUCT_ORIGIN ?? "https://app.arclayer.localhost";
export const PLATFORM_ORIGIN =
  process.env.BROWSER_ACCEPTANCE_PLATFORM_ORIGIN ?? "https://platform.arclayer.localhost";

type ProductFixture = Readonly<{
  email: string;
  password: string;
  projectId: string;
  workspaceId: string;
}>;

type PlatformFixture = Readonly<{
  identifier: string;
  password: string;
  totpSecret: string;
}>;

export type BrowserAcceptanceFixture = Readonly<{
  product: ProductFixture;
  platform: PlatformFixture;
}>;

const TOTP_PERIOD_MS = 30_000;
const TOTP_MINIMUM_REMAINING_MS = 5_000;
const usedTotpCounters = new Set<number>();
let fixturePromise: Promise<BrowserAcceptanceFixture> | undefined;

export function productUrl(pathname: string): string {
  return new URL(pathname, PRODUCT_ORIGIN).toString();
}

export function platformUrl(pathname: string): string {
  return new URL(pathname, PLATFORM_ORIGIN).toString();
}

export async function getBrowserAcceptanceFixture(): Promise<BrowserAcceptanceFixture> {
  fixturePromise ??= readFixture();
  return fixturePromise;
}

export async function signInToProduct(page: Page): Promise<BrowserAcceptanceFixture> {
  const fixture = await getBrowserAcceptanceFixture();
  await page.goto(productUrl("/login/"));
  await page.getByLabel("Email").fill(fixture.product.email);
  await page.getByLabel("Password").fill(fixture.product.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(
    (url) => url.origin === PRODUCT_ORIGIN && !url.pathname.startsWith("/login"),
  );
  return fixture;
}

export async function signInToPlatform(page: Page): Promise<BrowserAcceptanceFixture> {
  const fixture = await getBrowserAcceptanceFixture();
  await page.goto(platformUrl("/sign-in"));
  await page.getByLabel("Email or username").fill(fixture.platform.identifier);
  await page.getByLabel("Password").fill(fixture.platform.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await page.getByLabel("Verification code").fill(await nextTotpCode(fixture.platform.totpSecret));
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  await page.waitForURL((url) => url.origin === PLATFORM_ORIGIN && url.pathname === "/");
  return fixture;
}

export async function expectNoPageHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function readFixture(): Promise<BrowserAcceptanceFixture> {
  const fixturePath = process.env.BROWSER_ACCEPTANCE_FIXTURE_PATH;
  if (!fixturePath)
    throw new Error("BROWSER_ACCEPTANCE_FIXTURE_PATH is required for browser acceptance");
  const parsed: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!isFixture(parsed)) throw new Error("Browser acceptance fixture has an invalid shape");
  return parsed;
}

function isFixture(value: unknown): value is BrowserAcceptanceFixture {
  if (!value || typeof value !== "object") return false;
  const fixture = value as Partial<BrowserAcceptanceFixture>;
  return (
    hasStringProperties(fixture.product, ["email", "password", "projectId", "workspaceId"]) &&
    hasStringProperties(fixture.platform, ["identifier", "password", "totpSecret"])
  );
}

function hasStringProperties(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return keys.every(
    (key) => typeof candidate[key] === "string" && candidate[key].trim().length > 0,
  );
}

async function nextTotpCode(secret: string): Promise<string> {
  while (true) {
    const now = Date.now();
    const counter = Math.floor(now / TOTP_PERIOD_MS);
    const remaining = TOTP_PERIOD_MS - (now % TOTP_PERIOD_MS);
    if (!usedTotpCounters.has(counter) && remaining >= TOTP_MINIMUM_REMAINING_MS) {
      usedTotpCounters.add(counter);
      return hotp(base32Decode(secret), counter);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, remaining + 100));
  }
}

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.trim().replace(/\s+/gu, "").replace(/=+$/u, "").toUpperCase();
  if (!normalized) throw new Error("Platform TOTP secret is empty");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Platform TOTP secret is not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}
