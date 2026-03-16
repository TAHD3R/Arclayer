import type { ForwardRefExoticComponent } from "react";
import type { LucideProps } from "lucide-react";

export type AnimatedLucideProps = LucideProps & {
  isHovered?: boolean;
  active?: boolean;
  expanded?: boolean;
  loop?: boolean;
};

export type LucideIcon = ForwardRefExoticComponent<any>;
