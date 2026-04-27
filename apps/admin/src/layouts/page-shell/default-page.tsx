import clsx from "clsx";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";

import {
  getPageTitleTooltipLabel,
  PageMainRegion,
  shouldHidePageHeader,
  type BasePageProps,
} from "./page-main-region";

export type DefaultPageProps = BasePageProps & {
  pageFrame?: "contained" | "full";
  largeViewportGutters?: boolean;
};

export function DefaultPage({
  title,
  titleTooltip,
  description,
  showFavoriteToggle = true,
  headerVisibility = "auto",
  action,
  extra,
  children,
  className,
  contentClassName,
  contentContainerClassName,
  pageFrame = "contained",
  largeViewportGutters = false,
}: DefaultPageProps) {
  const hideHeader = headerVisibility === "always" ? false : shouldHidePageHeader(children);
  const resolvedTitleTooltip = titleTooltip ?? getPageTitleTooltipLabel(title);

  return (
    <AdminRouteContainer
      pageFrame={pageFrame}
      className={clsx("min-h-full min-w-0", className)}
      innerClassName={
        largeViewportGutters
          ? "[--admin-route-gutter-x:1rem] sm:[--admin-route-gutter-x:1.5rem] lg:[--admin-route-gutter-x:4.5rem] xl:[--admin-route-gutter-x:6rem] 2xl:[--admin-route-gutter-x:7.5rem]"
          : undefined
      }
    >
      <div className="flex min-h-0 min-w-0 w-full" data-slot="default-page-shell">
        <PageMainRegion
          title={hideHeader ? undefined : title}
          titleTooltip={hideHeader ? undefined : resolvedTitleTooltip}
          description={hideHeader ? undefined : description}
          showFavoriteToggle={hideHeader ? false : showFavoriteToggle}
          action={hideHeader ? undefined : action}
          extra={hideHeader ? undefined : extra}
          contentClassName={contentClassName}
          contentContainerClassName={contentContainerClassName}
        >
          {children}
        </PageMainRegion>
      </div>
    </AdminRouteContainer>
  );
}
