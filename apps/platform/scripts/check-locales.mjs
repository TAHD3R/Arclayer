import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesRoot = path.join(platformRoot, "locales");
const localeNames = ["zh-CN", "en-US"];

function flattenKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

async function readLocale(locale) {
  const directory = path.join(localesRoot, locale);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  const namespaces = new Map();
  for (const file of files) {
    const raw = await readFile(path.join(directory, file), "utf8");
    namespaces.set(file, flattenKeys(JSON.parse(raw)).sort());
  }
  return namespaces;
}

const localeEntries = await Promise.all(localeNames.map(readLocale));
const [reference, comparison] = localeEntries;
const referenceFiles = [...reference.keys()];
const comparisonFiles = [...comparison.keys()];
if (JSON.stringify(referenceFiles) !== JSON.stringify(comparisonFiles)) {
  throw new Error(`Platform locale namespace mismatch: ${referenceFiles} != ${comparisonFiles}`);
}

for (const file of referenceFiles) {
  const referenceKeys = reference.get(file);
  const comparisonKeys = comparison.get(file);
  if (JSON.stringify(referenceKeys) !== JSON.stringify(comparisonKeys)) {
    throw new Error(`Platform locale key mismatch in ${file}`);
  }
}

console.log(`Platform locale parity passed for ${referenceFiles.length} namespaces.`);
