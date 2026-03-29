"use client";

import * as React from "react";

import { CheckIcon, Code2Icon, CopyIcon } from "lucide-react";
import { type TCodeBlockElement, NodeApi } from "platejs";
import { PlateElement, type PlateElementProps, useEditorRef } from "platejs/react";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

const CODE_BLOCK_LANGUAGES = [
  { label: "Plain Text", value: "plaintext" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "JSON", value: "json" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "Bash", value: "bash" },
  { label: "Python", value: "python" },
] as const;

export function CodeBlockElement(props: PlateElementProps<TCodeBlockElement>) {
  const editor = useEditorRef();
  const lang = props.element.lang || "plaintext";
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  return (
    <PlateElement
      {...props}
      className="my-6 rounded-3xl border border-border/70 bg-slate-950 text-slate-100 "
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5"
        contentEditable={false}
      >
        <div className="inline-flex items-center gap-2 text-footnote text-slate-300">
          <Code2Icon className="size-4" />
          <span>{CODE_BLOCK_LANGUAGES.find((item) => item.value === lang)?.label ?? "Code"}</span>
        </div>

        <div className="flex items-center gap-1">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 rounded-lg px-2 text-footnote text-slate-300 hover:bg-white/10 hover:text-white"
              >
                {CODE_BLOCK_LANGUAGES.find((item) => item.value === lang)?.label ?? "Plain Text"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              {CODE_BLOCK_LANGUAGES.map((language) => (
                <DropdownMenuItem
                  key={language.value}
                  onSelect={() => {
                    editor.tf.setNodes<TCodeBlockElement>(
                      { lang: language.value },
                      { at: props.path },
                    );
                    editor.tf.focus();
                  }}
                >
                  {language.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              void navigator.clipboard.writeText(NodeApi.string(props.element));
              setCopied(true);
            }}
          >
            {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </Button>
        </div>
      </div>

      <pre className="overflow-x-auto px-4 py-4 text-footnote  [tab-size:2]">
        <code className={cn("block min-w-full font-mono text-slate-100")}>{props.children}</code>
      </pre>
    </PlateElement>
  );
}

export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} className="font-mono" />;
}
