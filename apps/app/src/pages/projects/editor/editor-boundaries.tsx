import { Button } from "@arclayer/ui/button";
import { ArrowLeft, Blocks, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EditorSidebar } from "@/layouts/creation-layout";

export function EditorLoadingState() {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent" aria-busy="true">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="h-5 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-9 w-96 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="relative flex min-h-0 flex-1">
        <EditorSidebar />
        <div className="relative min-w-0 flex-1 bg-transparent">
          <div className="absolute top-24 left-[18%] h-24 w-60 animate-pulse rounded-lg border border-border bg-background motion-reduce:animate-none" />
          <div className="absolute top-52 left-[43%] h-24 w-60 animate-pulse rounded-lg border border-border bg-background motion-reduce:animate-none" />
          <div className="absolute top-80 left-[43%] h-24 w-60 animate-pulse rounded-lg border border-border bg-background motion-reduce:animate-none" />
          <div className="absolute inset-y-0 right-0 w-[360px] border-l border-border bg-background p-5">
            <div className="h-5 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="mt-8 h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function EditorBoundary({
  title,
  description,
  actionLabel,
  onAction,
  onBack,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("account");
  return (
    <main className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="flex h-14 items-center border-b border-border px-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("CREATION_EDITOR_BACK")}>
          <ArrowLeft className="size-4" />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <EditorSidebar />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-lg text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-label-secondary">
              <Blocks className="size-6" />
            </span>
            <h1 className="mt-5 text-title-2 font-semibold text-label-primary">{title}</h1>
            <p className="mx-auto mt-3 max-w-md text-body leading-6 text-label-secondary">
              {description}
            </p>
            <Button className="mt-6" onClick={onAction}>
              <RefreshCw className="size-4" />
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
