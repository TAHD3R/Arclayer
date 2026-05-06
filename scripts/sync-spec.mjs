#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const SOURCE_DIR = path.join(ROOT_DIR, 'docs', 'spec');
const MIRROR_DIR = path.join(ROOT_DIR, '.trellis', 'spec');

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listFilesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  /** @type {string[]} */
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @param {string} baseDir
 * @returns {Promise<Map<string, string>>}
 */
async function getFileHashes(baseDir) {
  const absoluteFiles = await listFilesRecursive(baseDir);
  const hashes = new Map();
  for (const absoluteFile of absoluteFiles) {
    const relativeFile = path.relative(baseDir, absoluteFile).replaceAll(path.sep, '/');
    const fileBuffer = await readFile(absoluteFile);
    const hash = createHash('sha256').update(fileBuffer).digest('hex');
    hashes.set(relativeFile, hash);
  }
  return hashes;
}

/**
 * @param {Map<string, string>} source
 * @param {Map<string, string>} mirror
 */
function diffMaps(source, mirror) {
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const extra = [];
  /** @type {string[]} */
  const different = [];

  for (const [relativeFile, sourceHash] of source.entries()) {
    const mirrorHash = mirror.get(relativeFile);
    if (!mirrorHash) {
      missing.push(relativeFile);
      continue;
    }
    if (sourceHash !== mirrorHash) {
      different.push(relativeFile);
    }
  }

  for (const relativeFile of mirror.keys()) {
    if (!source.has(relativeFile)) {
      extra.push(relativeFile);
    }
  }

  missing.sort();
  extra.sort();
  different.sort();

  return { missing, extra, different };
}

/**
 * @param {{missing: string[]; extra: string[]; different: string[]}} diff
 */
function printDiff(diff) {
  const hasDrift = diff.missing.length || diff.extra.length || diff.different.length;
  if (!hasDrift) {
    console.log('spec mirror is up to date');
    return;
  }

  console.log('spec mirror drift detected');
  if (diff.missing.length > 0) {
    console.log(`missing (${diff.missing.length})`);
    for (const file of diff.missing) {
      console.log(`  - ${file}`);
    }
  }
  if (diff.extra.length > 0) {
    console.log(`extra (${diff.extra.length})`);
    for (const file of diff.extra) {
      console.log(`  - ${file}`);
    }
  }
  if (diff.different.length > 0) {
    console.log(`different (${diff.different.length})`);
    for (const file of diff.different) {
      console.log(`  - ${file}`);
    }
  }
}

async function ensureSourceExists() {
  try {
    const sourceStat = await stat(SOURCE_DIR);
    if (!sourceStat.isDirectory()) {
      throw new Error(`source path is not a directory: ${SOURCE_DIR}`);
    }
  } catch (error) {
    throw new Error(`source directory not found: ${SOURCE_DIR}`, { cause: error });
  }
}

async function runCheckMode() {
  await ensureSourceExists();
  const sourceHashes = await getFileHashes(SOURCE_DIR);
  const mirrorHashes = await getFileHashes(MIRROR_DIR).catch(() => new Map());
  const diff = diffMaps(sourceHashes, mirrorHashes);
  printDiff(diff);
  const hasDrift = diff.missing.length || diff.extra.length || diff.different.length;
  if (hasDrift) {
    process.exitCode = 1;
  }
}

async function runSyncMode() {
  await ensureSourceExists();
  await rm(MIRROR_DIR, { recursive: true, force: true });
  await mkdir(MIRROR_DIR, { recursive: true });

  const sourceFiles = await listFilesRecursive(SOURCE_DIR);
  for (const sourceAbsolute of sourceFiles) {
    const relativeFile = path.relative(SOURCE_DIR, sourceAbsolute);
    const mirrorAbsolute = path.join(MIRROR_DIR, relativeFile);
    await mkdir(path.dirname(mirrorAbsolute), { recursive: true });
    const fileContent = await readFile(sourceAbsolute);
    await writeFile(mirrorAbsolute, fileContent);
  }

  const sourceHashes = await getFileHashes(SOURCE_DIR);
  const mirrorHashes = await getFileHashes(MIRROR_DIR);
  const diff = diffMaps(sourceHashes, mirrorHashes);
  printDiff(diff);
  const hasDrift = diff.missing.length || diff.extra.length || diff.different.length;
  if (hasDrift) {
    process.exitCode = 1;
    return;
  }
  console.log(`synced ${sourceHashes.size} files from docs/spec to .trellis/spec`);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== 'sync' && mode !== 'check') {
    console.error('usage: node scripts/sync-spec.mjs <sync|check>');
    process.exitCode = 1;
    return;
  }
  if (mode === 'check') {
    await runCheckMode();
    return;
  }
  await runSyncMode();
}

await main();
