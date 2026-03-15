import { useRouter } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { AdminRouteContainer } from "@/components/layout/admin-route-container";
import { Button } from "@celestial/ui/button";
import {
  Illust401LockedTerminal,
  Illust403ForbiddenGateway,
  Illust404BrokenLink,
  Illust500CrashedServer,
} from "@celestial/ui/illustrations";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@celestial/ui/empty";

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
      <Button onClick={() => void router.navigate({ to: "/login" })}>{t("common:GO_LOGIN")}</Button>
    );
  }

  if (props.status === "404" || props.status === "403") {
    return <Button onClick={() => void router.navigate({ to: "/" })}>{t("common:GO_HOME")}</Button>;
  }

  return <Button onClick={() => window.location.reload()}>{t("common:REFRESH")}</Button>;
}

function pickBuiltinIllustration(status: BuiltinResultStatus) {
  if (status === "401") return Illust401LockedTerminal;
  if (status === "403") return Illust403ForbiddenGateway;
  if (status === "404") return Illust404BrokenLink;
  return Illust500CrashedServer;
}

export function BuiltinResultPage({
  status,
  title,
  subTitle,
  variant = "admin",
  extra,
}: BuiltinResultPageProps) {
  const actions = useMemo(() => {
    if (extra) return extra;
    return <DefaultAction status={status} />;
  }, [extra, status]);

  const Illustration = pickBuiltinIllustration(status);

  const content = (
    <div className="py-10">
      <Empty className="border-dashed">
        <EmptyHeader>
          <EmptyMedia className="mb-0">
            <Illustration className="max-w-105" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          {subTitle ? (
            <EmptyDescription className="text-footnote md:text-body">{subTitle}</EmptyDescription>
          ) : null}
        </EmptyHeader>
        {actions ? (
          <EmptyContent className="flex-row flex-wrap justify-center">{actions}</EmptyContent>
        ) : null}
      </Empty>
    </div>
  );

  if (variant === "fullscreen") {
    return (
      <div className="fixed inset-0 z-2147483647 flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-2xl">{content}</div>
      </div>
    );
  }

  return (
    <AdminRouteContainer>
      <div className="w-full">{content}</div>
    </AdminRouteContainer>
  );
}
