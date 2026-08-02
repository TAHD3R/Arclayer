import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedLocalesRoot = path.resolve(adminRoot, "../../locales");
const productLocalesRoot = path.join(adminRoot, "locales");
const localeNames = ["zh-CN", "en-US"];
const productNamespaceFiles = [
  "common",
  "nav",
  "rbac",
  "setup",
  "onboarding",
  "invite",
  "team",
  "activity",
  "appearance",
  "settings",
  "account",
  "notifications",
  "command",
  "assets",
  "content",
  "errors",
  "auth",
  "ai",
  "feedback",
  "commerce",
  "workspaceAccess",
  "planChange",
  "featureAccess",
];
const productLocalNamespaces = new Set(["errors"]);
const forbiddenProductLocaleKey = /(?:^|\.)(?:PLATFORM_|SYS_)/;

function productErrorMessages(messages) {
  return Object.fromEntries(
    Object.entries(messages).filter(([key]) => !forbiddenProductLocaleKey.test(key)),
  );
}

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

async function readLocale(locale) {
  const namespaces = new Map();
  for (const namespace of productNamespaceFiles) {
    const root = productLocalNamespaces.has(namespace) ? productLocalesRoot : sharedLocalesRoot;
    const file = `${namespace}.json`;
    const raw = await readFile(path.join(root, locale, file), "utf8");
    const keys = flattenKeys(JSON.parse(raw)).sort();
    const forbiddenKey = keys.find((key) => forbiddenProductLocaleKey.test(key));
    if (forbiddenKey) {
      throw new Error(`Admin Product locale must not contain ${forbiddenKey} in ${locale}/${file}`);
    }
    if (namespace === "errors") {
      const sharedRaw = await readFile(path.join(sharedLocalesRoot, locale, file), "utf8");
      const expected = productErrorMessages(JSON.parse(sharedRaw));
      if (JSON.stringify(JSON.parse(raw)) !== JSON.stringify(expected)) {
        throw new Error(
          `Admin Product errors drifted from filtered shared errors in ${locale}/${file}`,
        );
      }
    }
    namespaces.set(file, keys);
  }
  return namespaces;
}

const [reference, comparison] = await Promise.all(localeNames.map(readLocale));
const referenceFiles = [...reference.keys()];
const comparisonFiles = [...comparison.keys()];
if (JSON.stringify(referenceFiles) !== JSON.stringify(comparisonFiles)) {
  throw new Error(`Admin locale namespace mismatch: ${referenceFiles} != ${comparisonFiles}`);
}

for (const file of referenceFiles) {
  if (JSON.stringify(reference.get(file)) !== JSON.stringify(comparison.get(file))) {
    throw new Error(`Admin locale key mismatch in ${file}`);
  }
}

console.log(`Admin locale parity passed for ${referenceFiles.length} namespaces.`);
