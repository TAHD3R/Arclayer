import { Button, Card, Descriptions, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { Switch } from "@celestial/ui/switch";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";

import type { UIEmbedDescriptor } from "@/types/api";
import type { InstalledExtensionItem } from "../types";

const DEFAULT_EMBED_SANDBOX = "allow-forms allow-scripts allow-same-origin";

export type ExtensionDetailPageProps = {
  extensionRef: string;
  extension: InstalledExtensionItem | null;
  loading: boolean;
  loadError: unknown;
  onRetryLoad?: () => void;
  onBack: () => void;
  onToggleEnabled: (enabled: boolean) => Promise<unknown>;
  togglePending: boolean;
  canManage: boolean;

  uiEmbeds: UIEmbedDescriptor[];
  uiEmbedsLoading: boolean;
  uiEmbedsError: unknown;
  onRetryUIEmbeds: () => void;
};

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function pickSandbox(embed: UIEmbedDescriptor): string {
  const raw = typeof embed.sandbox === "string" ? embed.sandbox.trim() : "";
  return raw || DEFAULT_EMBED_SANDBOX;
}

function ExtensionDetailsTab(props: { extension: InstalledExtensionItem }) {
  const { t } = useTranslation(["plugin", "common"]);
  const provider = normalizeToken(props.extension.provider);
  const kind = normalizeToken(props.extension.kind);
  const scope = normalizeToken(props.extension.scope);

  const providerLabel = t(`plugin:EXTENSION_PROVIDER_${provider.toUpperCase()}`, {
    defaultValue: provider,
  });
  const kindLabel = t(`plugin:EXTENSION_KIND_${kind.toUpperCase()}`, { defaultValue: kind });
  const scopeLabel = t(`plugin:EXTENSION_SCOPE_${scope.toUpperCase()}`, { defaultValue: scope });

  return (
    <Card size="small" type="inner" title={t("plugin:PLUGIN_TAB_DETAILS")}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label={t("plugin:PLUGIN_META_ID")}>
          <Typography.Text code>{props.extension.capabilityId}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label={t("plugin:PLUGIN_META_VERSION")}>
          {props.extension.version || t("common:NA")}
        </Descriptions.Item>
        <Descriptions.Item label={t("plugin:EXTENSION_META_KIND")}>
          {kindLabel || t("common:NA")}
        </Descriptions.Item>
        <Descriptions.Item label={t("plugin:EXTENSION_META_PROVIDER")}>
          {providerLabel || t("common:NA")}
        </Descriptions.Item>
        <Descriptions.Item label={t("plugin:EXTENSION_META_SCOPE")}>
          {scopeLabel || t("common:NA")}
        </Descriptions.Item>
        <Descriptions.Item label={t("plugin:PLUGIN_META_ENABLED")}>
          {props.extension.enabled
            ? t("plugin:PLUGIN_ENABLED_TRUE")
            : t("plugin:PLUGIN_ENABLED_FALSE")}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function useSelectedEmbed(embeds: UIEmbedDescriptor[]) {
  const [selectedEmbedId, setSelectedEmbedId] = useState<string | null>(null);
  const selectedEmbed = useMemo(() => {
    if (!embeds.length) return null;
    if (!selectedEmbedId) return embeds[0];
    return embeds.find((e) => e.id === selectedEmbedId) ?? embeds[0];
  }, [embeds, selectedEmbedId]);

  useEffect(() => {
    if (!embeds.length) {
      setSelectedEmbedId(null);
      return;
    }
    if (!selectedEmbedId) return;
    if (embeds.some((e) => e.id === selectedEmbedId)) return;
    setSelectedEmbedId(embeds[0].id);
  }, [embeds, selectedEmbedId]);

  return { selectedEmbedId, setSelectedEmbedId, selectedEmbed };
}

function UIEmbedSelector(props: {
  embeds: UIEmbedDescriptor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (props.embeds.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {props.embeds.map((embed) => (
        <Button
          key={embed.id}
          type={embed.id === props.selectedId ? "primary" : "default"}
          autoInsertSpace={false}
          onClick={() => props.onSelect(embed.id)}
        >
          {embed.title}
        </Button>
      ))}
    </div>
  );
}

function UIEmbedFrame(props: { embed: UIEmbedDescriptor }) {
  return (
    <Card size="small" type="inner" title={props.embed.title}>
      <div className="h-[70vh] w-full overflow-hidden rounded-md border border-border">
        <iframe
          title={props.embed.title}
          src={props.embed.embedUrl}
          sandbox={pickSandbox(props.embed)}
          referrerPolicy="no-referrer"
          className="h-full w-full"
          loading="lazy"
        />
      </div>
    </Card>
  );
}

function ExtensionUIEmbedsTab(props: {
  uiEmbeds: UIEmbedDescriptor[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["plugin", "common"]);
  const availableEmbeds = props.uiEmbeds ?? [];
  const { selectedEmbedId, setSelectedEmbedId, selectedEmbed } = useSelectedEmbed(availableEmbeds);

  if (props.loading && !availableEmbeds.length)
    return <ContentGuard loading loadingVariant="form" />;
  if (props.error)
    return <ContentGuard loading={false} error={props.error} onRetry={props.onRetry} />;
  if (!selectedEmbed) {
    return (
      <ContentGuard
        loading={false}
        empty
        emptyTitle={t("common:EMPTY_TITLE")}
        emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <UIEmbedSelector
        embeds={availableEmbeds}
        selectedId={selectedEmbedId}
        onSelect={setSelectedEmbedId}
      />
      <UIEmbedFrame embed={selectedEmbed} />
    </div>
  );
}

function ExtensionDetailAction(props: {
  canManage: boolean;
  extension: InstalledExtensionItem | null;
  togglePending: boolean;
  onBack: () => void;
  onToggleEnabled: (enabled: boolean) => Promise<unknown>;
}) {
  const { t } = useTranslation(["common", "plugin"]);
  return (
    <div className="flex items-center gap-3">
      <Button onClick={props.onBack} autoInsertSpace={false}>
        {t("common:BACK")}
      </Button>
      {props.extension ? (
        <Switch
          checked={props.extension.enabled}
          aria-label={t("plugin:PLUGIN_CENTER_TOGGLE_ARIA", { name: props.extension.name })}
          onCheckedChange={(checked) => void props.onToggleEnabled(checked)}
          disabled={!props.canManage || props.togglePending}
        />
      ) : null}
    </div>
  );
}

function ExtensionDetailBody(props: {
  tab: string;
  onTab: (v: string) => void;
  extensionRef: string;
  extension: InstalledExtensionItem | null;
  loading: boolean;
  loadError: unknown;
  onRetryLoad?: () => void;
  uiEmbeds: UIEmbedDescriptor[];
  uiEmbedsLoading: boolean;
  uiEmbedsError: unknown;
  onRetryUIEmbeds: () => void;
}) {
  const { t } = useTranslation(["plugin", "common"]);
  const detailsTab = "details";
  const uiTab = "ui";

  return (
    <ContentGuard loading={props.loading} error={props.loadError} onRetry={props.onRetryLoad}>
      {props.extension ? (
        <ChromeTabs value={props.tab} onValueChange={(value) => props.onTab(String(value))}>
          <ChromeTabsList>
            <ChromeTabsTrigger value={detailsTab}>
              {t("plugin:PLUGIN_TAB_DETAILS")}
            </ChromeTabsTrigger>
            <ChromeTabsTrigger value={uiTab}>{t("common:EXTENSIONS")}</ChromeTabsTrigger>
          </ChromeTabsList>

          <ChromeTabsContent value={detailsTab}>
            <ExtensionDetailsTab extension={props.extension} />
          </ChromeTabsContent>

          <ChromeTabsContent value={uiTab}>
            <ExtensionUIEmbedsTab
              uiEmbeds={props.uiEmbeds}
              loading={props.uiEmbedsLoading}
              error={props.uiEmbedsError}
              onRetry={props.onRetryUIEmbeds}
            />
          </ChromeTabsContent>
        </ChromeTabs>
      ) : (
        <ContentGuard
          loading={false}
          empty
          emptyTitle={t("plugin:PLUGIN_NOT_FOUND")}
          emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
        />
      )}
    </ContentGuard>
  );
}

export function ExtensionDetailPage(props: ExtensionDetailPageProps) {
  const { t } = useTranslation(["nav", "plugin", "common"]);
  const [tab, setTab] = useState<string>("details");

  const detailsTab = "details";
  const uiTab = "ui";

  useEffect(() => {
    const valid = new Set([detailsTab, uiTab]);
    if (valid.has(tab)) return;
    setTab(detailsTab);
  }, [tab]);

  return (
    <DefaultPage
      title={
        props.extension
          ? props.extension.name
          : `${t("nav:NAV_EXTENSIONS")} / ${props.extensionRef}`
      }
      description={props.extension?.description || t("common:NA")}
      width="fixed"
      action={
        <ExtensionDetailAction
          canManage={props.canManage}
          extension={props.extension}
          togglePending={props.togglePending}
          onBack={props.onBack}
          onToggleEnabled={props.onToggleEnabled}
        />
      }
    >
      <ExtensionDetailBody
        tab={tab}
        onTab={setTab}
        extensionRef={props.extensionRef}
        extension={props.extension}
        loading={props.loading}
        loadError={props.loadError}
        onRetryLoad={props.onRetryLoad}
        uiEmbeds={props.uiEmbeds}
        uiEmbedsLoading={props.uiEmbedsLoading}
        uiEmbedsError={props.uiEmbedsError}
        onRetryUIEmbeds={props.onRetryUIEmbeds}
      />
    </DefaultPage>
  );
}
