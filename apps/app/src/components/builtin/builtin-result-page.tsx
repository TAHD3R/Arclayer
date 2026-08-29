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
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";
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

function DefaultAction(props: { status: BuiltinResultStatus }) {
  const { t } = useTranslation();
  const router = useRouter();

  if (props.status === "401") {
    return (
      <Button size="lg" onClick={() => void router.navigate({ to: "/login" })}>
        {t("common:GO_LOGIN")}
      </Button>
    );
  }

  if (props.status === "404" || props.status === "403") {
    return (
      <Button size="lg" onClick={() => void router.navigate({ to: "/" })}>
        {t("common:GO_HOME")}
      </Button>
    );
  }

  return (
    <Button size="lg" onClick={() => window.location.reload()}>
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
  const StatusIcon = pickBuiltinIcon(status);

  const content = (
    <div className={isFullscreen ? "w-full" : "py-10"}>
      <Empty data-status={status} className="border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <StatusIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle id={titleId} role="heading" aria-level={isFullscreen ? 1 : 2}>
            {title}
          </EmptyTitle>
          {subTitle ? <EmptyDescription>{subTitle}</EmptyDescription> : null}
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">
          {extra ?? <DefaultAction status={status} />}
        </EmptyContent>
      </Empty>
    </div>
  );

  if (isFullscreen) {
    return (
      <section
        aria-labelledby={titleId}
        className="fixed inset-0 z-2147483647 isolate flex overflow-y-auto bg-background"
      >
        <div className="flex min-h-full w-full items-center justify-center p-6">{content}</div>
      </section>
    );
  }

  return (
    <AdminRouteContainer>
      <div className="w-full">{content}</div>
    </AdminRouteContainer>
  );
}
