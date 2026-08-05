import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RUN_ROOT = "/tmp/arclayer-browser-acceptance";
const DATABASE_NAME = process.env.BROWSER_ACCEPTANCE_DATABASE_NAME ?? "arclayer_browser_acceptance";
const VALKEY_DB = Number(process.env.BROWSER_ACCEPTANCE_VALKEY_DB ?? "14");
const PRODUCT_ORIGIN = "https://app.arclayer.localhost";
const PLATFORM_ORIGIN = "https://platform.arclayer.localhost";

function fail(message) {
  throw new Error(`Browser acceptance setup failed: ${message}`);
}

function assertIsolatedTarget() {
  if (!/^arclayer_browser_[a-z0-9_]+$/u.test(DATABASE_NAME)) {
    fail(
      `BROWSER_ACCEPTANCE_DATABASE_NAME must be an isolated arclayer_browser_* database, got ${DATABASE_NAME}`,
    );
  }
  if (!Number.isInteger(VALKEY_DB) || VALKEY_DB < 0 || VALKEY_DB > 15 || VALKEY_DB === 15) {
    fail(
      `BROWSER_ACCEPTANCE_VALKEY_DB must be an isolated Valkey database other than 15, got ${VALKEY_DB}`,
    );
  }
  if (process.env.BROWSER_ACCEPTANCE_CONFIRM_RESET !== DATABASE_NAME) {
    fail(
      `set BROWSER_ACCEPTANCE_CONFIRM_RESET=${DATABASE_NAME} before resetting the isolated acceptance database`,
    );
  }
}

function command(commandName, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      cwd: ROOT,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      detached: options.detached ?? false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${commandName} ${args.join(" ")} exited with ${code ?? signal ?? "unknown status"}`,
        ),
      );
    });
  });
}

function start(name, commandName, args, env) {
  const log = createWriteStream(path.join(RUN_ROOT, `${name}.log`), { flags: "a" });
  const child = spawn(commandName, args, {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.once("error", (error) => log.write(`spawn error: ${error.stack ?? error.message}\n`));
  return { child, log, name };
}

async function stop(processes) {
  for (const { child } of processes) {
    if (child.pid && child.exitCode === null) process.kill(-child.pid, "SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
  for (const { child, log } of processes) {
    if (child.pid && child.exitCode === null) process.kill(-child.pid, "SIGKILL");
    log.end();
  }
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 45_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(
    `${label} did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function acceptanceEnvironment() {
  const productJwtSecret = randomSecret();
  const platformJwtSecret = randomSecret();
  return {
    ...process.env,
    APP_ENV: "test",
    DATABASE__ENABLED: "1",
    VALKEY__ENABLED: "1",
    TESTING__DATABASE_NAME: DATABASE_NAME,
    TESTING__VALKEY_DB: String(VALKEY_DB),
    TESTING__VALKEY_PREFIX: "browser_acceptance",
    TESTING__VALKEY_DEFAULT_TTL: "60",
    AUTH__JWT_SECRET: productJwtSecret,
    AUTH__JWT_ISSUER: "arclayer-browser-product",
    AUTH__JWT_AUDIENCE: "arclayer-browser-product-api",
    AUTH__COOKIE__ENABLED: "1",
    AUTH__COOKIE__SECURE: "1",
    AUTH__COOKIE__DOMAIN: ".arclayer.localhost",
    PLATFORM_AUTH__JWT_SECRET: platformJwtSecret,
    PLATFORM_AUTH__JWT_ISSUER: "arclayer-browser-platform",
    PLATFORM_AUTH__JWT_AUDIENCE: "arclayer-browser-platform-api",
    SECURITY__MASTER_KEY_PATH: path.join(RUN_ROOT, "platform-mfa-master.key"),
    SECURITY__ENABLED: "1",
    SECURITY__ENABLE_CORS: "1",
    SECURITY__CORS_ALLOW_ORIGINS: JSON.stringify([PRODUCT_ORIGIN]),
    SECURITY__CORS_ALLOW_CREDENTIALS: "1",
    SECURITY__CSRF__ENABLED: "1",
    SECURITY__CSRF__COOKIE_SECURE: "1",
    SECURITY__CSRF__TRUSTED_ORIGINS: JSON.stringify([PRODUCT_ORIGIN]),
    PLATFORM_SECURITY__ENABLED: "1",
    PLATFORM_SECURITY__ENABLE_CORS: "1",
    PLATFORM_SECURITY__CORS_ALLOW_ORIGINS: JSON.stringify([PLATFORM_ORIGIN]),
    PLATFORM_SECURITY__CORS_ALLOW_CREDENTIALS: "1",
    PLATFORM_SECURITY__CSRF__ENABLED: "1",
    PLATFORM_SECURITY__CSRF__COOKIE_SECURE: "1",
    PLATFORM_SECURITY__CSRF__TRUSTED_ORIGINS: JSON.stringify([PLATFORM_ORIGIN]),
    MAIL__SUPPRESS_SEND: "1",
    UV_CACHE_DIR: "/tmp/arclayer-uv-cache",
    PLAYWRIGHT_BROWSERS_PATH: "/tmp/arclayer-playwright",
    BROWSER_ACCEPTANCE_FIXTURE_PATH: path.join(RUN_ROOT, "fixture.json"),
    BROWSER_ACCEPTANCE_PRODUCT_ORIGIN: PRODUCT_ORIGIN,
    BROWSER_ACCEPTANCE_PLATFORM_ORIGIN: PLATFORM_ORIGIN,
    BROWSER_ACCEPTANCE_DATABASE_NAME: DATABASE_NAME,
    BROWSER_ACCEPTANCE_VALKEY_DB: String(VALKEY_DB),
  };
}

async function resetIsolatedState() {
  const sql = [
    `DROP DATABASE IF EXISTS \"${DATABASE_NAME}\" WITH (FORCE);`,
    `CREATE DATABASE \"${DATABASE_NAME}\";`,
  ].join(" ");
  await command("docker", ["compose", "up", "-d", "postgres", "valkey", "traefik"]);
  await command("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "sh",
    "-lc",
    `psql -v ON_ERROR_STOP=1 -U \"$POSTGRES_USER\" -d postgres -c '${sql}'`,
  ]);
  await command("docker", [
    "compose",
    "exec",
    "-T",
    "valkey",
    "valkey-cli",
    "-n",
    String(VALKEY_DB),
    "FLUSHDB",
  ]);
}

async function main() {
  assertIsolatedTarget();
  await rm(RUN_ROOT, { recursive: true, force: true });
  await mkdir(RUN_ROOT, { recursive: true });
  const env = acceptanceEnvironment();
  await resetIsolatedState();
  await command("pnpm", ["-C", "apps/api", "db:upgrade"], { env });
  await command(
    "pnpm",
    ["-C", "apps/api", "uv", "--", "python", "-m", "scripts.browser_acceptance_fixtures"],
    { env },
  );

  const processes = [
    start(
      "product-api",
      "pnpm",
      [
        "-C",
        "apps/api",
        "uv",
        "--",
        "uvicorn",
        "src.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
      ],
      env,
    ),
    start(
      "platform-api",
      "pnpm",
      [
        "-C",
        "apps/api",
        "uv",
        "--",
        "uvicorn",
        "src.platform_main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8001",
      ],
      env,
    ),
    start("product-app", "pnpm", ["-C", "apps/app", "dev", "--", "--host", "0.0.0.0"], env),
    start("platform-app", "pnpm", ["-C", "apps/platform", "dev", "--", "--host", "0.0.0.0"], env),
  ];
  try {
    await Promise.all([
      waitForHttp("http://127.0.0.1:8000/docs", "Product API"),
      waitForHttp("http://127.0.0.1:8001/docs", "Platform API"),
      waitForHttp("http://127.0.0.1:5173", "Product Application"),
      waitForHttp("http://127.0.0.1:5174", "Platform Console"),
    ]);
    await command("pnpm", ["exec", "playwright", "test", "--config=playwright.config.ts"], { env });
  } finally {
    await stop(processes);
  }
}

await main();
