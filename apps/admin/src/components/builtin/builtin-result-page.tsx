import { useRouter } from "@tanstack/react-router";
import {
  CircleAlert,
  CircleCheck,
  Info,
  LockKeyhole,
  SearchX,
  ServerCrash,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AuroraSceneBackground } from "@/components/aurora-scene-background";
import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";

export type BuiltinResultVariant = "admin" | "fullscreen";

type BuiltinResultStatus = "401" | "403" | "404" | "500" | "error" | "info" | "success" | "warning";

export type BuiltinResultPageProps = {
  status: BuiltinResultStatus;
  title: string;
  subTitle?: string;
  variant?: BuiltinResultVariant;
  /** Custom action area; falls back to a default "go home / login / refresh" button. */
  extra?: ReactNode;
};

function DefaultAction(props: { status: BuiltinResultStatus; size?: "default" | "lg" }) {
  const { t } = useTranslation();
  const router = useRouter();

  if (props.status === "401") {
    return (
      <Button size={props.size} onClick={() => void router.navigate({ to: "/login" })}>
        {t("common:GO_LOGIN")}
      </Button>
    );
  }

  if (props.status === "404" || props.status === "403") {
    return (
      <Button size={props.size} onClick={() => void router.navigate({ to: "/" })}>
        {t("common:GO_HOME")}
      </Button>
    );
  }

  return (
    <Button size={props.size} onClick={() => window.location.reload()}>
      {t("common:REFRESH")}
    </Button>
  );
}

function pickBuiltinIcon(status: BuiltinResultStatus) {
  if (status === "401") return LockKeyhole;
  if (status === "403") return ShieldX;
  if (status === "404") return SearchX;
  if (status === "success") return CircleCheck;
  if (status === "info") return Info;
  if (status === "warning") return TriangleAlert;
  if (status === "error") return CircleAlert;
  return ServerCrash;
}

export function BuiltinResultPage({
  status,
  title,
  subTitle,
  variant = "admin",
  extra,
}: BuiltinResultPageProps) {
  const titleId = useId();
  const isFullscreen = variant === "fullscreen";
  const actions = useMemo(() => {
    if (extra) return extra;
    return <DefaultAction status={status} size={isFullscreen ? "lg" : "default"} />;
  }, [extra, isFullscreen, status]);
  const StatusIcon = pickBuiltinIcon(status);

  const content = (
    <div className={cn(isFullscreen ? "w-full" : "py-10")}>
      <Empty
        data-status={status}
        className={cn("border-dashed", isFullscreen && "gap-7 rounded-none border-0 p-0 sm:gap-8")}
      >
        <EmptyHeader
          className={cn(isFullscreen && "max-w-[min(64rem,calc(100vw-3rem))] gap-3 sm:gap-4")}
        >
          <EmptyMedia variant="icon">
            <StatusIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle
            id={titleId}
            role="heading"
            aria-level={isFullscreen ? 1 : 2}
            className={cn(
              isFullscreen &&
                "max-w-5xl text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.08] font-bold tracking-[-0.035em] text-pretty",
            )}
          >
            {title}
          </EmptyTitle>
          {subTitle ? (
            <EmptyDescription
              className={cn(
                isFullscreen &&
                  "max-w-2xl text-[clamp(1rem,1.6vw,1.25rem)] leading-relaxed text-pretty",
              )}
            >
              {subTitle}
            </EmptyDescription>
          ) : null}
        </EmptyHeader>
        {actions ? (
          <EmptyContent
            className={cn("flex-row flex-wrap justify-center", isFullscreen && "w-auto gap-3")}
          >
            {actions}
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );

  if (isFullscreen) {
    return (
      <section
        aria-labelledby={titleId}
        className="fixed inset-0 z-2147483647 isolate flex overflow-y-auto bg-background"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <AuroraSceneBackground testId="fullscreen-result-aurora" />
        </div>
        <div className="relative z-10 flex min-h-full w-full items-center justify-center px-6 py-[clamp(3rem,8vh,6rem)] sm:px-12">
          {content}
        </div>
      </section>
    );
  }

  return (
    <AdminRouteContainer>
      <div className="w-full">{content}</div>
    </AdminRouteContainer>
  );
}
