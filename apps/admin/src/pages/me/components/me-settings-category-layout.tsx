import { useCallback, useMemo, useState, type ReactNode } from "react";

import { MiniCategoryNav } from "@/components/common/mini-category-nav";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@celestial/lib/utils";

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
      <MiniCategoryNav
        items={categories}
        selectedKey={selectedCategory}
        onSelect={onCategoryChange}
        className={props.navClassName}
      />
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
