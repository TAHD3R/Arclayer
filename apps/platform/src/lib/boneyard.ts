import { configureBoneyard } from "boneyard-js/react";

import.meta.glob("../bones/registry.{js,ts}", { eager: true });

let configured = false;

export function toPlatformBoneyardRouteName(routeId: string | undefined, pathname: string): string {
  const source = routeId || pathname || "home";
  const slug = source
    .replaceAll("$", "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `platform-route-${slug || "home"}`;
}

export function configurePlatformBoneyard(): void {
  if (configured) return;
  configureBoneyard({
    color: "color-mix(in oklab, var(--color-primary) 9%, var(--color-background))",
    darkColor: "color-mix(in oklab, var(--color-primary) 14%, var(--color-background))",
    shimmerColor: "color-mix(in oklab, var(--color-primary) 4%, var(--color-background))",
    darkShimmerColor: "color-mix(in oklab, var(--color-primary) 20%, var(--color-background))",
    animate: "shimmer",
    speed: "1.8s",
    transition: 180,
    select: "viewport",
  });
  configured = true;
}
