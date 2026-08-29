import { Check, ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MarkdownPlugin } from "@platejs/markdown";
import { normalizeNodeId, type Value } from "platejs";
import { createStaticEditor } from "platejs/static";

// Deep imports keep the math/katex editor surface (and its CSS side effects)
// out of this preview path.
import { BaseBasicBlocksKit } from "@arclayer/ui/editor/plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "@arclayer/ui/editor/plugins/basic-marks-base-kit";
import { EditorStatic } from "@arclayer/ui/editor/ui/editor-static";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

export type SkillFileSummary = Readonly<{
  byteSize: number;
  content?: string | null;
  mimeType: string;
  path: string;
  role: string;
}>;

const INSTRUCTIONS_PATH = "SKILL.md";
const PREVIEW_PLUGINS = [MarkdownPlugin, ...BaseBasicBlocksKit, ...BaseBasicMarksKit];
const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];

type StaticEditor = ReturnType<typeof createStaticEditor>;

function getMarkdownApi(editor: StaticEditor) {
  const markdown = (
    editor.api as { markdown?: { deserialize: (source: string) => Value } } | undefined
  )?.markdown;
  if (!markdown) throw new Error("SKILL_MARKDOWN_PREVIEW_API_UNAVAILABLE");
  return markdown;
}

const FRONTMATTER_DELIMITER = "- - -".replaceAll(" ", "");

/**
 * Skills carry a YAML frontmatter header that the markdown pipeline cannot
 * render; split it off so it previews as its own code block ahead of the body.
 */
function splitFrontmatter(source: string) {
  const lines = source.split(/\r?\n/);
  const isDelimiter = (line: string | undefined) => (line ?? "").trim() === FRONTMATTER_DELIMITER;
  if (!isDelimiter(lines[0])) return { body: source, frontmatter: null };
  const closeIndex = lines.findIndex((line, index) => index > 0 && isDelimiter(line));
  if (closeIndex === -1) return { body: source, frontmatter: null };
  return {
    body: lines.slice(closeIndex + 1).join("\n"),
    frontmatter: lines.slice(1, closeIndex).join("\n"),
  };
}

export function SkillMarkdownPreview(props: Readonly<{ source: string }>) {
  const { body, frontmatter } = useMemo(() => splitFrontmatter(props.source), [props.source]);
  const editor = useMemo(() => {
    const scratch = createStaticEditor({ plugins: PREVIEW_PLUGINS });
    const value = body.trim()
      ? normalizeNodeId(getMarkdownApi(scratch).deserialize(body))
      : EMPTY_VALUE;
    return createStaticEditor({ plugins: PREVIEW_PLUGINS, value });
  }, [body]);

  return (
    <div>
      {frontmatter !== null ? (
        <div className="m-4 mb-0 overflow-hidden rounded-lg border bg-muted/40">
          <div aria-hidden="true" className="px-4 pt-2.5 text-caption text-label-tertiary">
            YAML
          </div>
          <pre className="overflow-x-auto px-4 pb-3 pt-1 font-mono text-footnote leading-6 whitespace-pre-wrap text-label-primary">
            {frontmatter}
          </pre>
        </div>
      ) : null}
      <EditorStatic editor={editor} className="px-5 py-4 text-body leading-7" />
    </div>
  );
}

type FileTreeNode = Readonly<{
  children: FileTreeNode[];
  file?: SkillFileSummary;
  name: string;
  path: string;
}>;

type MutableFileTreeNode = {
  children: MutableFileTreeNode[];
  file?: SkillFileSummary;
  name: string;
  path: string;
};

function insertFile(root: MutableFileTreeNode, file: SkillFileSummary) {
  const parts = file.path.split("/").filter(Boolean);
  let node = root;
  parts.forEach((part, index) => {
    const isLeaf = index === parts.length - 1;
    const path = parts.slice(0, index + 1).join("/");
    let child = node.children.find(
      (candidate) => candidate.name === part && Boolean(candidate.file) === isLeaf,
    );
    if (!child) {
      child = { children: [], name: part, path };
      node.children.push(child);
    }
    if (isLeaf) child.file = file;
    node = child;
  });
}

function sortTreeNodes(nodes: MutableFileTreeNode[]): FileTreeNode[] {
  return [...nodes]
    .sort((left, right) => {
      const leftIsFolder = !left.file;
      const rightIsFolder = !right.file;
      if (leftIsFolder !== rightIsFolder) return leftIsFolder ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .map((node) => ({ ...node, children: sortTreeNodes(node.children) }));
}

function buildFileTree(files: readonly SkillFileSummary[]) {
  const root: MutableFileTreeNode = { children: [], name: "", path: "" };
  for (const file of files) insertFile(root, file);
  return sortTreeNodes(root.children);
}

function FileTreeItems(
  props: Readonly<{
    collapsedPaths: ReadonlySet<string>;
    depth: number;
    nodes: readonly FileTreeNode[];
    onToggleFolder: (path: string) => void;
    onSelect: (path: string) => void;
    selectedPath?: string;
  }>,
) {
  return (
    <>
      {props.nodes.map((node) =>
        node.file ? (
          <DropdownMenuItem
            className={`gap-2 ${props.selectedPath === node.path ? "bg-accent" : ""}`}
            key={node.path}
            onSelect={() => props.onSelect(node.path)}
            style={{ paddingLeft: `${0.875 + props.depth * 0.75}rem` }}
          >
            <FileText aria-hidden="true" className="size-3.5 shrink-0 text-label-tertiary" />
            <span className="min-w-0 truncate">{node.name}</span>
            {props.selectedPath === node.path ? (
              <Check aria-hidden="true" className="ml-auto size-3.5 shrink-0" />
            ) : null}
          </DropdownMenuItem>
        ) : (
          <Fragment key={node.path}>
            <DropdownMenuItem
              aria-expanded={!props.collapsedPaths.has(node.path)}
              className="gap-2"
              onSelect={(event) => {
                event.preventDefault();
                props.onToggleFolder(node.path);
              }}
              style={{ paddingLeft: `${0.875 + props.depth * 0.75}rem` }}
            >
              <ChevronRight
                aria-hidden="true"
                className={`size-3.5 shrink-0 text-label-tertiary transition-transform ${
                  props.collapsedPaths.has(node.path) ? "" : "rotate-90"
                }`}
              />
              <Folder aria-hidden="true" className="size-3.5 shrink-0 text-label-tertiary" />
              <span className="min-w-0 truncate">{node.name}</span>
            </DropdownMenuItem>
            {props.collapsedPaths.has(node.path) ? null : (
              <FileTreeItems
                collapsedPaths={props.collapsedPaths}
                depth={props.depth + 1}
                nodes={node.children}
                onToggleFolder={props.onToggleFolder}
                onSelect={props.onSelect}
                selectedPath={props.selectedPath}
              />
            )}
          </Fragment>
        ),
      )}
    </>
  );
}

function isMarkdownFile(file: SkillFileSummary) {
  return file.mimeType.includes("markdown") || file.path.toLowerCase().endsWith(".md");
}

export function WorkspaceSkillFileBrowser(
  props: Readonly<{
    files: readonly SkillFileSummary[];
  }>,
) {
  const { t } = useTranslation("settings");
  const [requestedPath, setRequestedPath] = useState<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const files = useMemo(
    () => [...props.files].sort((left, right) => left.path.localeCompare(right.path)),
    [props.files],
  );
  const tree = useMemo(() => buildFileTree(files), [files]);
  const fallback = files.find((file) => file.path === INSTRUCTIONS_PATH) ?? files[0];
  const selected = files.find((file) => file.path === requestedPath) ?? fallback;

  // Folders start expanded; collapsing is a user toggle inside the dropdown.
  const toggleFolder = (path: string) => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (!files.length) {
    return (
      <div className="rounded-xl border px-4 py-6 text-center text-body text-label-tertiary">
        {t("SETTINGS_WORKSPACE_SKILLS_FILE_EMPTY")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("SETTINGS_WORKSPACE_SKILLS_FILE_SELECT_LABEL")}
              className="max-w-full gap-2 font-mono text-footnote font-normal"
              size="sm"
              variant="outline"
            >
              <span className="min-w-0 truncate">{selected?.path}</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-label-tertiary" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-y-auto">
            <FileTreeItems
              collapsedPaths={collapsedPaths}
              depth={0}
              nodes={tree}
              onToggleFolder={toggleFolder}
              onSelect={setRequestedPath}
              selectedPath={selected?.path}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="shrink-0 pr-1 text-caption text-label-tertiary">
          {t("SETTINGS_WORKSPACE_SKILLS_FILES_COUNT", { count: files.length })}
        </span>
      </div>
      <div className="max-h-[min(50vh,30rem)] overflow-auto">
        {selected ? (
          isMarkdownFile(selected) ? (
            <SkillMarkdownPreview source={selected.content ?? ""} />
          ) : selected.content != null ? (
            <pre className="px-5 py-4 font-mono text-footnote leading-6 whitespace-pre-wrap text-label-primary">
              {selected.content}
            </pre>
          ) : (
            <div className="px-5 py-4 text-body text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_FILE_PREVIEW_UNAVAILABLE")}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
