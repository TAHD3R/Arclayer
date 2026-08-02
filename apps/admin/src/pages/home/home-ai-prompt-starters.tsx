import { useAui } from "@assistant-ui/react";
import {
  BlocksIcon,
  ChevronDownIcon,
  Globe2Icon,
  PaletteIcon,
  ShoppingBagIcon,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import {
  AI_PROMPT_STARTER_CATEGORIES,
  type AIPromptStarterCategoryId,
} from "@/components/ai/ai-prompt-starters";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";

const STARTER_CATEGORY_ICONS: Readonly<Record<AIPromptStarterCategoryId, LucideIcon>> = {
  website: Globe2Icon,
  content: BlocksIcon,
  brand: PaletteIcon,
  commerce: ShoppingBagIcon,
};

const STARTER_OPTIONS_VARIANTS: Variants = {
  hidden: {
    height: 0,
    opacity: 0,
  },
  visible: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
      opacity: { duration: 0.16, delay: 0.04, ease: [0.22, 1, 0.36, 1] },
      delayChildren: 0.04,
      staggerChildren: 0.04,
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
      opacity: { duration: 0.1, ease: [0.22, 1, 0.36, 1] },
    },
  },
};

const STARTER_OPTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } },
};

export function HomeAIPromptStarters(props: { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const { t } = useTranslation("ai");
  const aui = useAui();
  const reducedMotion = usePrefersReducedMotion();
  const [activeCategoryId, setActiveCategoryId] = useState<AIPromptStarterCategoryId | null>(null);
  const activeCategory = AI_PROMPT_STARTER_CATEGORIES.find((item) => item.id === activeCategoryId);
  const activeOptionsId = activeCategory
    ? `home-ai-starter-options-${activeCategory.id}`
    : undefined;

  const choosePrompt = (promptKey: string) => {
    aui.composer().setText(t(promptKey));
    props.inputRef.current?.focus();
    setActiveCategoryId(null);
  };

  return (
    <div className="relative mt-4 w-full" data-testid="home-ai-prompt-starters">
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {AI_PROMPT_STARTER_CATEGORIES.map((category) => {
          const Icon = STARTER_CATEGORY_ICONS[category.id];
          const active = category.id === activeCategoryId;
          return (
            <Button
              key={category.id}
              type="button"
              variant="outline"
              aria-expanded={active}
              aria-controls={active ? activeOptionsId : undefined}
              className={cn(
                "h-11 w-auto !rounded-md border-border/70 bg-card px-4 text-footnote font-semibold text-label-secondary shadow-none transition-[background-color,border-color,color] duration-150 dark:bg-card motion-reduce:transition-none",
                "justify-start",
                "hover:border-border hover:bg-accent hover:text-label-primary dark:hover:bg-accent",
                active && "border-border bg-accent text-label-primary dark:bg-accent",
              )}
              onClick={() => setActiveCategoryId(active ? null : category.id)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{t(category.labelKey)}</span>
              <ChevronDownIcon
                className={cn(
                  "ml-2 size-3.5 transition-transform duration-150 motion-reduce:transition-none",
                  active && "rotate-180",
                )}
                aria-hidden="true"
              />
            </Button>
          );
        })}
      </div>
      <AnimatePresence key={reducedMotion ? "reduced-motion" : "motion"} initial={false}>
        {activeCategory ? (
          <motion.div
            key="home-ai-starter-options"
            id={activeOptionsId}
            initial={reducedMotion ? false : "hidden"}
            animate={reducedMotion ? undefined : "visible"}
            exit={reducedMotion ? undefined : "exit"}
            variants={reducedMotion ? undefined : STARTER_OPTIONS_VARIANTS}
            data-slot="home-ai-starter-options"
            className="relative z-20 overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-3">
              {activeCategory.promptKeys.map((promptKey) => (
                <motion.button
                  key={promptKey}
                  type="button"
                  variants={reducedMotion ? undefined : STARTER_OPTION_VARIANTS}
                  className="min-h-12 w-full rounded-md border border-border/70 bg-popover px-4 py-3 text-left text-footnote font-medium leading-5 text-label-secondary shadow-[0_10px_28px_-18px_color-mix(in_oklab,var(--color-foreground)_30%,transparent)] transition-[background-color,border-color,color] duration-150 hover:border-border hover:bg-accent hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  onClick={() => choosePrompt(promptKey)}
                >
                  {t(promptKey)}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
