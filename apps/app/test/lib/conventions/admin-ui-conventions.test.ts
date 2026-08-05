import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type SourceViolation = {
  file: string;
  line: number;
  column: number;
  message: string;
};

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  const subdirs: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) subdirs.push(fullPath);
    if (!entry.isFile()) continue;
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) files.push(fullPath);
  }

  const nestedFiles = await Promise.all(subdirs.map((subdir) => listSourceFiles(subdir)));
  return [...files, ...nestedFiles.flat()];
}

function getPosition(sf: ts.SourceFile, node: ts.Node): { line: number; column: number } {
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf, false));
  return { line: pos.line + 1, column: pos.character + 1 };
}

function parseSourceFile(filePath: string, code: string): ts.SourceFile {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, code, ts.ScriptTarget.ES2022, true, scriptKind);
}

function findNamedImportsFromModule(sf: ts.SourceFile, moduleName: string): Map<string, string> {
  const imported = new Map<string, string>();

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (stmt.moduleSpecifier.text !== moduleName) continue;
    const clause = stmt.importClause;
    const bindings = clause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const el of bindings.elements) {
      const exportedName = el.propertyName?.text ?? el.name.text;
      imported.set(exportedName, el.name.text);
    }
  }

  return imported;
}

function hasAutoInsertSpaceFalse(attrs: ts.JsxAttributes): boolean {
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (!ts.isIdentifier(attr.name)) continue;
    if (attr.name.text !== "autoInsertSpace") continue;
    const init = attr.initializer;
    if (!init || !ts.isJsxExpression(init)) return false;
    const expr = init.expression;
    return expr !== undefined && expr.kind === ts.SyntaxKind.FalseKeyword;
  }
  return false;
}

function visit(node: ts.Node, onNode: (n: ts.Node) => void) {
  onNode(node);
  node.forEachChild((child) => visit(child, onNode));
}

describe("admin UI conventions", () => {
  it("does not import @arclayer/ui/confirm-dialog in Admin (prefer explicit AlertDialog + Antd footer)", async () => {
    const files = await listSourceFiles(SRC_ROOT);
    const violations: SourceViolation[] = [];

    const contents = await Promise.all(
      files.map(async (file) => ({
        file,
        code: await fs.readFile(file, "utf-8"),
      })),
    );

    for (const { file, code } of contents) {
      if (!code.includes("@arclayer/ui/confirm-dialog")) continue;
      violations.push({
        file,
        line: 1,
        column: 1,
        message: "ConfirmDialog import found",
      });
    }

    expect(violations).toEqual([]);
  });

  it("sets autoInsertSpace={false} on all Antd Button usages in Admin", async () => {
    const files = await listSourceFiles(SRC_ROOT);
    const violations: SourceViolation[] = [];

    const contents = await Promise.all(
      files.map(async (file) => ({ file, code: await fs.readFile(file, "utf-8") })),
    );

    for (const { file, code } of contents) {
      const sf = parseSourceFile(file, code);

      const antdImports = findNamedImportsFromModule(sf, "antd");
      const localButtonName = antdImports.get("Button");
      if (!localButtonName) continue;

      visit(sf, (node) => {
        const opening = (() => {
          if (ts.isJsxSelfClosingElement(node)) return node;
          if (ts.isJsxOpeningElement(node)) return node;
          return null;
        })();
        if (!opening) return;

        const tag = opening.tagName;
        if (!ts.isIdentifier(tag)) return;
        if (tag.text !== localButtonName) return;

        if (!hasAutoInsertSpaceFalse(opening.attributes)) {
          const { line, column } = getPosition(sf, opening);
          violations.push({
            file,
            line,
            column,
            message: `<${localButtonName}> missing autoInsertSpace={false}`,
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
