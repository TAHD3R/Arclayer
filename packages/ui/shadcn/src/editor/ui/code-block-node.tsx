"use client";

import * as React from "react";

import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";
import { type TCodeBlockElement, NodeApi } from "platejs";
import {
  PlateElement,
  PlateLeaf,
  type PlateElementProps,
  type PlateLeafProps,
  useEditorRef,
} from "platejs/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

const CODE_BLOCK_LANGUAGES = [
  { label: "Auto", value: "auto" },
  { label: "Plain Text", value: "plaintext" },
  { label: "ABAP", value: "abap" },
  { label: "Ada", value: "ada" },
  { label: "Agda", value: "agda" },
  { label: "Arduino", value: "arduino" },
  { label: "ASCII Art", value: "asciidoc" },
  { label: "Assembly", value: "asm" },
  { label: "Bash", value: "bash" },
  { label: "BASIC", value: "basic" },
  { label: "C", value: "c" },
  { label: "Clojure", value: "clojure" },
  { label: "C++", value: "cpp" },
  { label: "C#", value: "csharp" },
  { label: "CSS", value: "css" },
  { label: "Dart", value: "dart" },
  { label: "Diff", value: "diff" },
  { label: "Docker", value: "docker" },
  { label: "Elixir", value: "elixir" },
  { label: "Elm", value: "elm" },
  { label: "Erlang", value: "erlang" },
  { label: "Fortran", value: "fortran" },
  { label: "Go", value: "go" },
  { label: "GraphQL", value: "graphql" },
  { label: "Groovy", value: "groovy" },
  { label: "Haskell", value: "haskell" },
  { label: "HTML", value: "html" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "javascript" },
  { label: "JSON", value: "json" },
  { label: "Julia", value: "julia" },
  { label: "Kotlin", value: "kotlin" },
  { label: "LaTeX", value: "latex" },
  { label: "Lua", value: "lua" },
  { label: "Markdown", value: "markdown" },
  { label: "MATLAB", value: "matlab" },
  { label: "Objective-C", value: "objectivec" },
  { label: "PHP", value: "php" },
  { label: "PowerShell", value: "powershell" },
  { label: "Prisma", value: "prisma" },
  { label: "Python", value: "python" },
  { label: "R", value: "r" },
  { label: "Ruby", value: "ruby" },
  { label: "Rust", value: "rust" },
  { label: "Scala", value: "scala" },
  { label: "SQL", value: "sql" },
  { label: "Swift", value: "swift" },
  { label: "TOML", value: "toml" },
  { label: "TypeScript", value: "typescript" },
  { label: "TSX", value: "tsx" },
  { label: "VB.NET", value: "vbnet" },
  { label: "Vue", value: "vue" },
  { label: "XML", value: "xml" },
  { label: "YAML", value: "yaml" },
] as const;

const CODE_BLOCK_SYNTAX_CLASSNAME = cn(
  "[&_code]:text-slate-100",
  "[&_.hljs-comment]:text-slate-400",
  "[&_.hljs-quote]:text-slate-400",
  "[&_.hljs-keyword]:text-[#ff7b72]",
  "[&_.hljs-selector-tag]:text-[#ff7b72]",
  "[&_.hljs-subst]:text-[#ff7b72]",
  "[&_.hljs-literal]:text-[#79c0ff]",
  "[&_.hljs-number]:text-[#79c0ff]",
  "[&_.hljs-attribute]:text-[#79c0ff]",
  "[&_.hljs-variable]:text-[#79c0ff]",
  "[&_.hljs-template-variable]:text-[#79c0ff]",
  "[&_.hljs-regexp]:text-[#79c0ff]",
  "[&_.hljs-string]:text-[#a5d6ff]",
  "[&_.hljs-char.escape_]:text-[#a5d6ff]",
  "[&_.hljs-doctag]:text-[#a5d6ff]",
  "[&_.hljs-type]:text-[#ffa657]",
  "[&_.hljs-title]:text-[#d2a8ff]",
  "[&_.hljs-section]:text-[#d2a8ff]",
  "[&_.hljs-selector-id]:text-[#d2a8ff]",
  "[&_.hljs-selector-class]:text-[#d2a8ff]",
  "[&_.hljs-symbol]:text-[#f2cc60]",
  "[&_.hljs-bullet]:text-[#f2cc60]",
  "[&_.hljs-built_in]:text-[#f2cc60]",
  "[&_.hljs-function]:text-[#c9d1d9]",
  "[&_.hljs-params]:text-[#c9d1d9]",
  "[&_.hljs-operator]:text-[#ff7b72]",
  "[&_.hljs-punctuation]:text-slate-500",
  "[&_.hljs-meta]:text-[#7ee787]",
  "[&_.hljs-link]:text-[#79c0ff]",
  "[&_.hljs-addition]:bg-emerald-500/10 [&_.hljs-addition]:text-emerald-300",
  "[&_.hljs-deletion]:bg-rose-500/10 [&_.hljs-deletion]:text-rose-300",
);

export function CodeBlockElement(props: PlateElementProps<TCodeBlockElement>) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const lang = props.element.lang || "plaintext";
  const [copied, setCopied] = React.useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  return (
    <PlateElement
      {...props}
      className="my-6 overflow-hidden rounded-md border border-border/70 bg-[#171717] text-slate-100"
    >
      <div
        className="flex items-center justify-end gap-1 border-b border-white/8 px-3 py-2"
        contentEditable={false}
      >
        <DropdownMenu open={languageMenuOpen} onOpenChange={setLanguageMenuOpen} modal={false}>
          <Tooltip>
            <TooltipTrigger asChild focusTrigger={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-slate-200 hover:bg-white/10 hover:text-white"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {CODE_BLOCK_LANGUAGES.find((item) => item.value === lang)?.label ?? "Plain Text"}
                  <ChevronDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("CONTENT_LIBRARY_EDITOR_CODE_BLOCK_LANGUAGE")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-[16rem] overflow-y-auto"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuRadioGroup
              value={lang}
              onValueChange={(value) => {
                editor.tf.setNodes<TCodeBlockElement>({ lang: value }, { at: props.path });
                setLanguageMenuOpen(false);
              }}
            >
              {CODE_BLOCK_LANGUAGES.map((language) => (
                <DropdownMenuRadioItem key={language.value} value={language.value}>
                  {language.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild focusTrigger={false}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-slate-300 hover:bg-white/10 hover:text-white"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                void navigator.clipboard.writeText(NodeApi.string(props.element));
                setCopied(true);
              }}
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {copied
              ? t("CONTENT_LIBRARY_EDITOR_CODE_BLOCK_COPY_SUCCESS")
              : t("CONTENT_LIBRARY_EDITOR_CODE_BLOCK_COPY")}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="bg-[#171717]">
        <pre
          className={cn(
            "overflow-x-auto px-5 py-5 text-[13px] leading-6 [tab-size:2]",
            CODE_BLOCK_SYNTAX_CLASSNAME,
          )}
        >
          <code className={cn("block min-w-full font-mono text-slate-100")}>{props.children}</code>
        </pre>
      </div>
    </PlateElement>
  );
}

export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} className="font-mono" />;
}

export function CodeSyntaxLeaf(props: PlateLeafProps) {
  const leafClassName =
    typeof (props.leaf as { className?: unknown }).className === "string"
      ? ((props.leaf as { className?: string }).className ?? "")
      : "";

  return (
    <PlateLeaf {...props} as="span" className={cn(props.className, leafClassName)}>
      {props.children}
    </PlateLeaf>
  );
}
