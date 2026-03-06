import type { ReactNode } from "react";
import { Tag, type TagProps } from "antd";
import type { LucideIcon } from "lucide-react";

import { cn } from "@celestial/lib/utils";

const TAG_ICON_SIZE_PX = 12;

export const TAG_BASE_ROOT_CLASSNAME = "!px-2 !py-1 !text-caption !font-semibold !border-border";

type TagSemanticClassNames = {
  root?: string;
  icon?: string;
  content?: string;
};

type BaseTagProps = Omit<TagProps, "classNames" | "icon"> & {
  icon?: ReactNode;
  classNames?: TagSemanticClassNames;
};

function mergeTagClassNames(overrides: TagSemanticClassNames | undefined): TagSemanticClassNames {
  return {
    root: cn(TAG_BASE_ROOT_CLASSNAME, overrides?.root),
    icon: cn("!inline-flex !items-center !mr-1 !leading-none", overrides?.icon),
    content: cn("!inline-flex !items-center !leading-none", overrides?.content),
  };
}

export function lucideTagIcon(Icon: LucideIcon, className?: string): ReactNode {
  return <Icon size={TAG_ICON_SIZE_PX} className={cn("shrink-0", className)} />;
}

export function BaseTag({ classNames, icon, children, ...props }: BaseTagProps) {
  const mergedClassNames = mergeTagClassNames(classNames);
  const content = icon ? (
    <span className={mergedClassNames.content}>
      <span className={mergedClassNames.icon}>{icon}</span>
      <span className="!inline-flex !items-center">{children}</span>
    </span>
  ) : (
    <span className={mergedClassNames.content}>{children}</span>
  );

  return (
    <Tag {...props} classNames={{ root: mergedClassNames.root }}>
      {content}
    </Tag>
  );
}
