import clsx from "clsx";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";

import { PageMainRegion, shouldHidePageHeader, type BasePageProps } from "./page-main-region";

export type DefaultPageProps = BasePageProps;

export function DefaultPage({
  title,
  description,
  showFavoriteToggle = true,
  action,
  extra,
  children,
  className,
  contentClassName,
}: DefaultPageProps) {
  const hideHeader = shouldHidePageHeader(children);

  return (
    <AdminRouteContainer className={clsx("min-h-full min-w-0", className)}>
      <PageMainRegion
        title={hideHeader ? undefined : title}
        description={hideHeader ? undefined : description}
        showFavoriteToggle={hideHeader ? false : showFavoriteToggle}
        action={hideHeader ? undefined : action}
        extra={hideHeader ? undefined : extra}
        contentClassName={contentClassName}
      >
        {children}
      </PageMainRegion>
    </AdminRouteContainer>
  );
}
