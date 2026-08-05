import { Button } from "@arclayer/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronsUpDown,
  FileText,
  PanelsTopLeft,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { WireframeGenerationTargetOption } from "@/pages/projects/editor/wireframe-generation-targets";

interface WireframeGenerationTargetSelectorProps {
  selectedTargets: readonly WireframeGenerationTargetOption[];
  availableTargets: readonly WireframeGenerationTargetOption[];
  disabled: boolean;
  onAdd: (target: WireframeGenerationTargetOption) => void;
  onRemove: (target: WireframeGenerationTargetOption) => void;
  onMove: (target: WireframeGenerationTargetOption, direction: -1 | 1) => void;
}

export function WireframeGenerationTargetSelector({
  selectedTargets,
  availableTargets,
  disabled,
  onAdd,
  onRemove,
  onMove,
}: WireframeGenerationTargetSelectorProps) {
  const { t } = useTranslation("account");
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-4 border-y border-border py-4" aria-labelledby="wireframe-targets-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4
            id="wireframe-targets-title"
            className="text-caption font-semibold text-label-primary"
          >
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGETS_TITLE")}
          </h4>
          <p className="mt-1 text-caption leading-5 text-label-secondary">
            {t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGETS_DESC", {
              count: selectedTargets.length,
            })}
          </p>
        </div>
        <span className="shrink-0 font-mono text-caption text-label-secondary">
          {t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGETS_COUNT", {
            count: selectedTargets.length,
          })}
        </span>
      </div>

      <ol
        className="mt-3 space-y-2"
        aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGETS_SELECTED")}
      >
        {selectedTargets.map((target, index) => (
          <TargetRow
            key={`${target.target.kind}:${target.target.itemId}`}
            target={target}
            index={index}
            count={selectedTargets.length}
            disabled={disabled}
            onMove={onMove}
            onRemove={onRemove}
          />
        ))}
      </ol>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            role="combobox"
            aria-expanded={open}
            aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_ADD")}
            className="mt-3 min-h-11 w-full justify-between"
            disabled={disabled || availableTargets.length === 0}
          >
            <span>{t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_ADD")}</span>
            <ChevronsUpDown data-icon="inline-end" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="left" className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_SEARCH")} />
            <CommandList>
              <CommandEmpty>
                {t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_SEARCH_EMPTY")}
              </CommandEmpty>
              <CommandGroup heading={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_ADD_GROUP")}>
                {availableTargets.map((target) => (
                  <CommandItem
                    key={`${target.target.kind}:${target.target.itemId}`}
                    value={[target.title, target.locale, target.location, target.target.kind]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={disabled || !target.executable}
                    onSelect={() => {
                      setOpen(false);
                      onAdd(target);
                    }}
                  >
                    <TargetIdentity target={target} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </section>
  );
}

function TargetRow({
  target,
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: Readonly<{
  target: WireframeGenerationTargetOption;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (target: WireframeGenerationTargetOption, direction: -1 | 1) => void;
  onRemove: (target: WireframeGenerationTargetOption) => void;
}>) {
  const { t } = useTranslation("account");
  return (
    <li className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-2 py-2">
      <span className="w-5 shrink-0 text-center font-mono text-caption text-label-secondary">
        {index + 1}
      </span>
      <TargetIdentity target={target} />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {index > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_MOVE_EARLIER")}
            disabled={disabled}
            onClick={() => onMove(target, -1)}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        ) : null}
        {index < count - 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_MOVE_LATER")}
            disabled={disabled}
            onClick={() => onMove(target, 1)}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        ) : null}
        {count > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_REMOVE", {
              target: target.title,
            })}
            disabled={disabled}
            onClick={() => onRemove(target)}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function TargetIdentity({ target }: { target: WireframeGenerationTargetOption }) {
  const { t } = useTranslation("account");
  const KindIcon = target.target.kind === "page" ? FileText : PanelsTopLeft;
  const StateIcon = target.executable ? CheckCircle2 : TriangleAlert;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2.5">
      <KindIcon className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-caption font-medium text-label-primary">
            {target.title}
          </span>
          <span className="shrink-0 text-caption text-label-secondary">
            {t(
              target.target.kind === "page"
                ? "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_KIND_PAGE"
                : "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_KIND_GLOBAL_SECTION",
            )}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-caption text-label-secondary">
          {[
            target.locale,
            target.location,
            target.versionNumber ? `v${target.versionNumber}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-caption text-label-secondary">
          <StateIcon
            className={
              target.executable ? "mt-0.5 size-3.5 text-positive" : "mt-0.5 size-3.5 text-warning"
            }
            aria-hidden="true"
          />
          <span>
            {target.reasonKey
              ? t(target.reasonKey)
              : t("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_READY", {
                  dependencies: target.incomingReferenceCount,
                })}
          </span>
        </p>
      </div>
    </div>
  );
}
