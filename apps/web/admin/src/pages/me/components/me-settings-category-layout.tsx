import { motion } from "motion/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type MeSettingsCategory = {
  key: string;
  label: ReactNode;
  content: ReactNode;
};

export type MeSettingsCategoryLayoutProps = {
  categories: readonly MeSettingsCategory[];
  defaultCategoryKey?: string;
  className?: string;
  navClassName?: string;
  contentClassName?: string;
};

function buildSectionId(key: string) {
  return `me-settings-cat:${key}`;
}

export function MeSettingsCategoryLayout(props: MeSettingsCategoryLayoutProps) {
  const reducedMotion = usePrefersReducedMotion();
  const categories = props.categories;

  const firstKey = categories[0]?.key ?? "default";
  const [selectedCategory, setSelectedCategory] = useState<string>(
    props.defaultCategoryKey ?? firstKey,
  );

  const onCategoryChange = useCallback(
    (key: string) => {
      setSelectedCategory(key);
      const el = document.getElementById(buildSectionId(key));
      el?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [reducedMotion],
  );

  const nav = useMemo(
    () => (
      <nav className={cn("space-y-1.5", props.navClassName)}>
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange(cat.key)}
            aria-current={selectedCategory === cat.key ? "true" : undefined}
            className={cn(
              "relative flex h-10 w-full min-w-0 items-center pl-3 pr-2 text-footnote transition-colors duration-150",
              "rounded-md",
              selectedCategory === cat.key
                ? "font-semibold text-foreground bg-muted/40"
                : "text-label-secondary hover:text-label-primary hover:bg-muted/30",
            )}
          >
            {selectedCategory === cat.key ? (
              <motion.span
                layoutId="category-indicator"
                layout="position"
                className="absolute pointer-events-none inset-y-0 left-0 w-1 bg-primary rounded-l-md"
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              />
            ) : null}
            <span className="min-w-0 truncate">{cat.label}</span>
          </button>
        ))}
      </nav>
    ),
    [categories, onCategoryChange, props.navClassName, selectedCategory],
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        "md:grid md:grid-cols-[160px_minmax(0,1fr)] md:gap-8",
        props.className,
      )}
    >
      <aside className="md:pt-1">
        <div className="md:sticky md:top-8">{nav}</div>
      </aside>

      <div className={cn("min-w-0 flex flex-col gap-14 pb-12", props.contentClassName)}>
        {categories.map((cat) => (
          <section key={cat.key} id={buildSectionId(cat.key)} className="scroll-mt-28">
            {cat.content}
          </section>
        ))}
      </div>
    </div>
  );
}
