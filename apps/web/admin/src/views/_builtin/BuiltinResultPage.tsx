import { Button } from "antd";
import { useRouter } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/app/defaultPage";
import {
  OpenDoodlesClumsy,
  OpenDoodlesHouseplant,
  OpenDoodlesSkating,
} from "@/components/illustrations/openDoodles";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type BuiltinResultVariant = "admin" | "fullscreen";

type BuiltinResultStatus = "403" | "404" | "500" | "error" | "info" | "success" | "warning";

export type BuiltinResultPageProps = {
  status: BuiltinResultStatus;
  title: string;
  subTitle?: string;
  variant?: BuiltinResultVariant;
  /** 自定义操作区；不传则使用默认的“返回/回到首页/刷新”。 */
  extra?: ReactNode;
};

function DefaultActions(props: { showHome?: boolean; showRefresh?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();

  const goBack = () => {
    try {
      router.history.back();
    } catch {
      // ignore
    }
  };

  const goHome = () => {
    void router.navigate({ to: "/" });
  };

  const reload = () => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  return [
    <Button key="back" onClick={goBack}>
      {t("common:BACK")}
    </Button>,
    ...(props.showHome
      ? [
          <Button key="home" type="primary" onClick={goHome}>
            {t("common:GO_HOME")}
          </Button>,
        ]
      : []),
    ...(props.showRefresh === false
      ? []
      : [
          <Button key="refresh" onClick={reload}>
            {t("common:REFRESH")}
          </Button>,
        ]),
  ];
}

function pickBuiltinIllustration(status: BuiltinResultStatus) {
  if (status === "403") return OpenDoodlesHouseplant;
  if (status === "404") return OpenDoodlesSkating;
  return OpenDoodlesClumsy;
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
    return <DefaultActions showHome showRefresh={status !== "404"} />;
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
          {subTitle ? <EmptyDescription className="text-lg">{subTitle}</EmptyDescription> : null}
        </EmptyHeader>
        {actions ? (
          <EmptyContent className="flex-row flex-wrap justify-center">{actions}</EmptyContent>
        ) : null}
      </Empty>
    </div>
  );

  if (variant === "fullscreen") {
    // Use a fixed overlay so it can safely cover AdminLayout navigation when needed.
    return (
      <div className="fixed inset-0 z-2147483647 flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-2xl">{content}</div>
      </div>
    );
  }

  return (
    <DefaultPage width="fixed">
      <div className="w-full">{content}</div>
    </DefaultPage>
  );
}
