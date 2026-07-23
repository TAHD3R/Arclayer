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

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";

type StarterCategory = Readonly<{
  id: "website" | "content" | "brand" | "commerce";
  labelKey: string;
  icon: LucideIcon;
  promptKeys: readonly string[];
}>;

const STARTER_CATEGORIES: readonly StarterCategory[] = [
  {
    id: "website",
    labelKey: "AI_CHAT_HOME_STARTER_WEBSITE",
    icon: Globe2Icon,
    promptKeys: [
      "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_1",
      "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_2",
      "AI_CHAT_HOME_STARTER_WEBSITE_PROMPT_3",
    ],
  },
  {
    id: "content",
    labelKey: "AI_CHAT_HOME_STARTER_CONTENT",
    icon: BlocksIcon,
    promptKeys: [
      "AI_CHAT_HOME_STARTER_CONTENT_PROMPT_1",
      "AI_CHAT_HOME_STARTER_CONTENT_PROMPT_2",
      "AI_CHAT_HOME_STARTER_CONTENT_PROMPT_3",
    ],
  },
  {
    id: "brand",
    labelKey: "AI_CHAT_HOME_STARTER_BRAND",
    icon: PaletteIcon,
    promptKeys: [
      "AI_CHAT_HOME_STARTER_BRAND_PROMPT_1",
      "AI_CHAT_HOME_STARTER_BRAND_PROMPT_2",
      "AI_CHAT_HOME_STARTER_BRAND_PROMPT_3",
    ],
  },
  {
    id: "commerce",
    labelKey: "AI_CHAT_HOME_STARTER_COMMERCE",
    icon: ShoppingBagIcon,
    promptKeys: [
      "AI_CHAT_HOME_STARTER_COMMERCE_PROMPT_1",
      "AI_CHAT_HOME_STARTER_COMMERCE_PROMPT_2",
      "AI_CHAT_HOME_STARTER_COMMERCE_PROMPT_3",
    ],
  },
] as const;

const STARTER_OPTIONS_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
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
  const [activeCategoryId, setActiveCategoryId] = useState<StarterCategory["id"] | null>(null);
  const activeCategory = STARTER_CATEGORIES.find((item) => item.id === activeCategoryId);
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
        {STARTER_CATEGORIES.map((category) => {
          const Icon = category.icon;
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
      <AnimatePresence initial={false}>
        {activeCategory ? (
          <motion.div
            key={activeCategory.id}
            id={activeOptionsId}
            initial={reducedMotion ? false : "hidden"}
            animate={reducedMotion ? undefined : "visible"}
            exit={reducedMotion ? undefined : "exit"}
            variants={reducedMotion ? undefined : STARTER_OPTIONS_VARIANTS}
            className="absolute inset-x-0 top-full z-20 mt-3 flex flex-col gap-2"
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
