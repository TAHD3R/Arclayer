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
  spacingPreset?: "page" | "settings-dialog";
};

const PAGE_TOP_SPACER_CLASSNAME = "xl:pb-[clamp(20px,calc(5.90277778vw_-_65px),88px)]";
const SETTINGS_DIALOG_TOP_SPACER_CLASSNAME =
  "lg:pb-[clamp(20px,calc(10.36585366vw_-_86.146341px),88px)]";
const SETTINGS_DIALOG_ROUTE_FRAME_CLASSNAME =
  "lg:[--admin-route-gutter-x:clamp(2.5rem,calc(15.85365854vw_-_122.439024px),9rem)]";

function PageShellTopSpacer(props: { preset: NonNullable<DefaultPageProps["spacingPreset"]> }) {
  return (
    <div
      className="relative min-h-[20px] max-h-[88px] w-full overflow-hidden"
      aria-hidden="true"
      data-slot="page-shell-top-spacer"
      data-preset={props.preset}
    >
      <div
        className={clsx(
          "relative w-full pb-0",
          props.preset === "settings-dialog"
            ? SETTINGS_DIALOG_TOP_SPACER_CLASSNAME
            : PAGE_TOP_SPACER_CLASSNAME,
        )}
      />
    </div>
  );
}

export function DefaultPage({
  title,
  titleTooltip,
  description,
  showFavoriteToggle = true,
  favoritePath,
  afterFavorite,
  headerVisibility = "auto",
  action,
  extra,
  children,
  className,
  contentClassName,
  contentContainerClassName,
  pageFrame = "contained",
  spacingPreset = "page",
}: DefaultPageProps) {
  const hideHeader = headerVisibility === "always" ? false : shouldHidePageHeader(children);
  const resolvedTitleTooltip = titleTooltip ?? getPageTitleTooltipLabel(title);

  return (
    <AdminRouteContainer
      pageFrame={pageFrame}
      className={clsx("min-h-full min-w-0", className)}
      innerClassName={clsx(
        spacingPreset === "settings-dialog" && SETTINGS_DIALOG_ROUTE_FRAME_CLASSNAME,
      )}
    >
      <PageShellTopSpacer preset={spacingPreset} />
      <div className="flex min-h-0 min-w-0 w-full" data-slot="default-page-shell">
        <PageMainRegion
          title={hideHeader ? undefined : title}
          titleTooltip={hideHeader ? undefined : resolvedTitleTooltip}
          description={hideHeader ? undefined : description}
          showFavoriteToggle={hideHeader ? false : showFavoriteToggle}
          favoritePath={hideHeader ? undefined : favoritePath}
          afterFavorite={hideHeader ? undefined : afterFavorite}
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
