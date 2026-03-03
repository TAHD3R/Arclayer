import { Button, Card, Segmented, Space, Tag, message } from "antd";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@tanstack/react-router";

import { DefaultPage } from "@/components/common/default-page";
import {
  Illust401LockedTerminal,
  Illust403ForbiddenGateway,
  Illust404BrokenLink,
  Illust422MalformedPacket,
  Illust429OverloadedGauge,
  Illust500CrashedServer,
  IllustEmptyContainer,
  type IllustrationProps,
} from "@celestial/ui/illustrations";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@celestial/ui/empty";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@celestial/lib/utils";

type PreviewWidth = 280 | 360 | 440 | 520;

interface PreviewEntry {
  status: 401 | 403 | 404 | 422 | 429 | 500;
  title: string;
  description: string;
  Illustration: ComponentType<IllustrationProps>;
  actions: ReactNode;
}

function ResultPreviewCard(props: { entry: PreviewEntry; previewWidth: PreviewWidth }) {
  const widthClassName = useMemo(() => {
    if (props.previewWidth === 280) return "max-w-[280px]";
    if (props.previewWidth === 360) return "max-w-[360px]";
    if (props.previewWidth === 440) return "max-w-[440px]";
    return "max-w-[520px]";
  }, [props.previewWidth]);

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-footnote text-label-secondary">HTTP {props.entry.status}</div>
        <Tag>{props.entry.status}</Tag>
      </div>

      <div className="mt-4">
        <div className={cn("mx-auto w-full", widthClassName)}>
          <Empty className="border-dashed bg-background">
            <EmptyHeader>
              <EmptyMedia className="mb-0">
                <props.entry.Illustration className="w-full max-w-none" />
              </EmptyMedia>
              <EmptyTitle>{props.entry.title}</EmptyTitle>
              <EmptyDescription className="text-footnote md:text-body">
                {props.entry.description}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              {props.entry.actions}
            </EmptyContent>
          </Empty>
        </div>
      </div>
    </Card>
  );
}

export function IllustrationsDebugPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>(360);

  const toastAction = () => {
    message.info(t("debug:ILLUSTRATIONS_ACTION_TOAST"));
  };

  const entries = useMemo<PreviewEntry[]>(() => {
    return [
      {
        status: 401,
        title: t("common:PAGE_UNAUTHORIZED_TITLE"),
        description: t("common:PAGE_UNAUTHORIZED_DESC"),
        Illustration: Illust401LockedTerminal,
        actions: (
          <Space wrap>
            <Button
              type="primary"
              onClick={() => void router.navigate({ to: "/login" })}
              autoInsertSpace={false}
            >
              {t("common:GO_LOGIN")}
            </Button>
            <Button onClick={toastAction} autoInsertSpace={false}>
              {t("common:REFRESH")}
            </Button>
          </Space>
        ),
      },
      {
        status: 403,
        title: t("common:PAGE_FORBIDDEN_TITLE"),
        description: t("common:PAGE_FORBIDDEN_DESC"),
        Illustration: Illust403ForbiddenGateway,
        actions: (
          <Space wrap>
            <Button
              type="primary"
              onClick={() => void router.navigate({ to: "/" })}
              autoInsertSpace={false}
            >
              {t("common:GO_HOME")}
            </Button>
            <Button onClick={toastAction} autoInsertSpace={false}>
              {t("common:RETRY")}
            </Button>
          </Space>
        ),
      },
      {
        status: 404,
        title: t("common:PAGE_NOT_FOUND_TITLE"),
        description: t("common:PAGE_NOT_FOUND_DESC"),
        Illustration: Illust404BrokenLink,
        actions: (
          <Space wrap>
            <Button
              type="primary"
              onClick={() => void router.navigate({ to: "/" })}
              autoInsertSpace={false}
            >
              {t("common:GO_HOME")}
            </Button>
            <Button onClick={toastAction} autoInsertSpace={false}>
              {t("common:REFRESH")}
            </Button>
          </Space>
        ),
      },
      {
        status: 422,
        title: t("common:PAGE_VALIDATION_TITLE"),
        description: t("common:PAGE_VALIDATION_DESC"),
        Illustration: Illust422MalformedPacket,
        actions: (
          <Space wrap>
            <Button type="primary" onClick={toastAction} autoInsertSpace={false}>
              {t("common:RETRY")}
            </Button>
            <Button onClick={toastAction} autoInsertSpace={false}>
              {t("common:BACK")}
            </Button>
          </Space>
        ),
      },
      {
        status: 429,
        title: t("common:PAGE_RATE_LIMIT_TITLE"),
        description: t("common:PAGE_RATE_LIMIT_DESC"),
        Illustration: Illust429OverloadedGauge,
        actions: (
          <Space wrap>
            <Button type="primary" onClick={toastAction} autoInsertSpace={false}>
              {t("common:RETRY")}
            </Button>
            <Button onClick={toastAction} autoInsertSpace={false}>
              {t("common:REFRESH")}
            </Button>
          </Space>
        ),
      },
      {
        status: 500,
        title: t("common:PAGE_SERVER_ERROR_TITLE"),
        description: t("common:PAGE_SERVER_ERROR_DESC"),
        Illustration: Illust500CrashedServer,
        actions: (
          <Space wrap>
            <Button type="primary" onClick={toastAction} autoInsertSpace={false}>
              {t("common:RETRY")}
            </Button>
            <Button onClick={() => void router.navigate({ to: "/" })} autoInsertSpace={false}>
              {t("common:GO_HOME")}
            </Button>
          </Space>
        ),
      },
    ];
  }, [router, t]);

  const rawIllustrations = useMemo(() => {
    return [
      { status: 401 as const, Illustration: Illust401LockedTerminal },
      { status: 403 as const, Illustration: Illust403ForbiddenGateway },
      { status: 404 as const, Illustration: Illust404BrokenLink },
      { status: 422 as const, Illustration: Illust422MalformedPacket },
      { status: 429 as const, Illustration: Illust429OverloadedGauge },
      { status: 500 as const, Illustration: Illust500CrashedServer },
    ];
  }, []);

  const emptyWidthClassName = useMemo(() => {
    if (previewWidth === 280) return "max-w-[280px]";
    if (previewWidth === 360) return "max-w-[360px]";
    if (previewWidth === 440) return "max-w-[440px]";
    return "max-w-[520px]";
  }, [previewWidth]);

  return (
    <DefaultPage
      width="full"
      title={t("debug:ILLUSTRATIONS_DEBUG_TITLE")}
      description={t("debug:ILLUSTRATIONS_DEBUG_DESC")}
      action={
        <Space wrap align="center">
          <Tag color={reducedMotion ? "default" : "green"}>
            {reducedMotion
              ? t("debug:ILLUSTRATIONS_REDUCED_MOTION_ON")
              : t("debug:ILLUSTRATIONS_REDUCED_MOTION_OFF")}
          </Tag>
          <Space size={6} align="center">
            <span className="text-footnote text-label-secondary">
              {t("debug:ILLUSTRATIONS_PREVIEW_WIDTH")}
            </span>
            <Segmented
              value={previewWidth}
              options={[
                { label: "280", value: 280 },
                { label: "360", value: 360 },
                { label: "440", value: 440 },
                { label: "520", value: 520 },
              ]}
              onChange={(value) => setPreviewWidth(value as PreviewWidth)}
            />
          </Space>
        </Space>
      }
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-title2">{t("debug:ILLUSTRATIONS_SECTION_RESULT")}</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {entries.map((entry) => (
              <ResultPreviewCard key={entry.status} entry={entry} previewWidth={previewWidth} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-title2">{t("debug:ILLUSTRATIONS_SECTION_RAW")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rawIllustrations.map(({ status, Illustration }) => (
              <Card key={status}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-footnote text-label-secondary">HTTP {status}</div>
                  <Tag>{status}</Tag>
                </div>
                <div className="mt-4">
                  <Illustration className="w-full max-w-none" />
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-title2">{t("debug:ILLUSTRATIONS_SECTION_EMPTY")}</h2>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="text-footnote text-label-secondary">{t("common:EMPTY_TITLE")}</div>
              <Tag>EMPTY</Tag>
            </div>
            <div className="mt-4">
              <div className={cn("mx-auto w-full", emptyWidthClassName)}>
                <IllustEmptyContainer className="w-full max-w-none" />
              </div>
            </div>
          </Card>
        </section>
      </div>
    </DefaultPage>
  );
}
