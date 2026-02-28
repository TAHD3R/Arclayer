import fs from "node:fs";
import path from "node:path";

export type BuildMeta = {
  appName: string;
  version: string;
  buildTime: string; // ISO
  gitSha?: string;
};

export type ResolveBuildMetaInput = {
  appName: string;
  version?: string;
  buildTime?: string;
  gitSha?: string;
  /**
   * Root directory to resolve package.json from.
   * Defaults to process.cwd() when omitted.
   */
  rootDir?: string;
};

const DEFAULT_GIT_SHA_ENV_KEYS = [
  "GIT_SHA",
  "VITE_GIT_SHA",
  "COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "GITHUB_SHA",
];

export function resolveBuildMeta(input: ResolveBuildMetaInput): BuildMeta {
  const rootDir = input.rootDir ?? process.cwd();

  const version =
    input.version?.trim() || readPackageVersion(rootDir) || "0.0.0";

  const buildTime = input.buildTime?.trim() || new Date().toISOString();

  const gitSha =
    input.gitSha?.trim() ||
    DEFAULT_GIT_SHA_ENV_KEYS.map((k) => process.env[k]).find((v) => typeof v === "string" && v.trim())?.trim();

  return {
    appName: input.appName,
    version,
    buildTime,
    ...(gitSha ? { gitSha } : {}),
  };
}

export function formatArchiveTimestamp(iso: string): string {
  // Example: 2026-02-28T12:34:56.789Z -> 20260228123456
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function buildDefaultBanner(meta: BuildMeta): string {
  const year = new Date(meta.buildTime).getUTCFullYear();
  const lines = [
    `CelestialCMS - ${meta.appName}`,
    `Version: ${meta.version}`,
    `Built at: ${meta.buildTime}`,
    ...(meta.gitSha ? [`Commit: ${meta.gitSha}`] : []),
    `Copyright (c) ${year}`,
  ];

  // Use /*! */ so it survives common minifiers.
  return `/*!\n * ${lines.join("\n * ")}\n */`;
}

function readPackageVersion(rootDir: string): string | null {
  try {
    const p = path.resolve(rootDir, "package.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : null;
  } catch {
    return null;
  }
}
