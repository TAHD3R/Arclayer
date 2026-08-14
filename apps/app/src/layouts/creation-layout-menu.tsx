import { useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, HelpCircle, Home, Search, Settings2, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminLogoMark } from "@/components/layout/admin-logo";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import {
  buildEditorMenuCopy,
  EditorEditMenu,
  EditorFileMenu,
  EditorMenuItem,
  EditorViewMenu,
  matchesSearch,
  MenuDivider,
} from "@/layouts/creation-layout-menu-sections";
import { cn } from "@arclayer/lib/utils";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@arclayer/ui/floating-panel";

function EditorLogoMenuTrigger() {
  const { isOpen } = useFloatingPanel();

  return (
    <FloatingPanelTrigger
      title="Arclayer"
      aria-label="Arclayer"
      disableLayoutId
      className={cn(
        "group/panel-trigger flex h-8 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-0",
        "text-label-secondary transition-[background-color,color,border-color] duration-200",
        "hover:bg-accent hover:text-label-primary",
        "data-[state=open]:bg-accent data-[state=open]:text-label-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <AdminLogoMark size={24} />
      <ChevronDown
        className={cn(
          "size-4 shrink-0 opacity-70 transition-transform duration-200",
          isOpen && "rotate-180",
        )}
        aria-hidden="true"
      />
    </FloatingPanelTrigger>
  );
}

function EditorLogoMenuContent(props: {
  query: string;
  copy: ReturnType<typeof buildEditorMenuCopy>;
  navigate: ReturnType<typeof useNavigate>;
  settingsScreen: ReturnType<typeof useSettingsScreen>;
  showFile: boolean;
  showEdit: boolean;
  showView: boolean;
  showSettings: boolean;
  showNotifications: boolean;
  showHelp: boolean;
  onQueryChange: (query: string) => void;
}) {
  const { closeFloatingPanel } = useFloatingPanel();
  const hasDashboard = matchesSearch(props.query, props.copy.dashboard);
  const hasResults =
    hasDashboard ||
    props.showFile ||
    props.showEdit ||
    props.showView ||
    matchesSearch(props.query, props.copy.share) ||
    props.showSettings ||
    props.showNotifications ||
    props.showHelp;
  const closeAfter = (action: () => void) => {
    action();
    closeFloatingPanel();
  };

  return (
    <div className="max-h-[min(40rem,calc(100vh-1rem))] w-72 overflow-y-auto">
      <div className="px-2 pb-2" onKeyDown={(event) => event.stopPropagation()}>
        <div className="flex h-10 items-center gap-2 px-3">
          <Search className="size-4 text-label-secondary" aria-hidden="true" />
          <input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={props.copy.search}
            aria-label={props.copy.search}
            className="min-w-0 flex-1 bg-transparent text-footnote text-label-primary outline-none placeholder:text-label-secondary"
          />
        </div>
      </div>

      {!hasResults ? (
        <div className="px-4 py-8 text-center text-callout text-label-secondary">
          {props.copy.noResults}
        </div>
      ) : null}

      {hasDashboard ? (
        <EditorMenuItem
          icon={<Home className="size-4" />}
          label={props.copy.dashboard}
          onSelect={() => closeAfter(() => void props.navigate({ to: "/" as never }))}
        />
      ) : null}

      {props.showFile || props.showEdit || props.showView ? <MenuDivider /> : null}
      {props.showFile ? (
        <EditorFileMenu
          copy={props.copy}
          onNewProject={() => closeAfter(() => void props.navigate({ to: "/projects" as never }))}
        />
      ) : null}
      {props.showEdit ? <EditorEditMenu copy={props.copy} /> : null}
      {props.showView ? <EditorViewMenu copy={props.copy} /> : null}

      {matchesSearch(props.query, props.copy.share) ? (
        <>
          <MenuDivider />
          <EditorMenuItem icon={<Share2 className="size-4" />} label={props.copy.share} disabled />
        </>
      ) : null}

      {props.showSettings || props.showNotifications || props.showHelp ? <MenuDivider /> : null}
      {props.showSettings ? (
        <EditorMenuItem
          icon={<Settings2 className="size-4" />}
          label={props.copy.preferences}
          onSelect={() =>
            closeAfter(() => props.settingsScreen.openSettings({ screen: "personal.preferences" }))
          }
        />
      ) : null}
      {props.showNotifications ? (
        <EditorMenuItem
          icon={<Bell className="size-4" />}
          label={props.copy.notifications}
          onSelect={() => closeAfter(() => void props.navigate({ to: "/notifications/" as never }))}
        />
      ) : null}
      {props.showHelp ? (
        <EditorMenuItem
          icon={<HelpCircle className="size-4" />}
          label={props.copy.helpAccount}
          onSelect={() =>
            closeAfter(() => props.settingsScreen.openSettings({ screen: "personal.profile" }))
          }
        />
      ) : null}
    </div>
  );
}

export function EditorLogoMenu({
  side = "bottom",
  align: _align = "start",
}: {
  side?: "bottom" | "right";
  align?: "start" | "center" | "end";
}) {
  const { t } = useTranslation("account");
  const navigate = useNavigate();
  const settingsScreen = useSettingsScreen();
  const [query, setQuery] = useState("");
  const copy = useMemo(() => buildEditorMenuCopy(t), [t]);
  const showFile = matchesSearch(
    query,
    copy.file,
    copy.newProject,
    copy.versionHistory,
    copy.saved,
  );
  const showEdit = matchesSearch(
    query,
    copy.edit,
    copy.undo,
    copy.redo,
    copy.askAi,
    copy.copy,
    copy.paste,
  );
  const showView = matchesSearch(
    query,
    copy.view,
    copy.comments,
    copy.sitemap,
    copy.wireframe,
    copy.design,
    copy.zoomFit,
  );
  const showSettings = matchesSearch(query, copy.preferences);
  const showNotifications = matchesSearch(query, copy.notifications);
  const showHelp = matchesSearch(query, copy.helpAccount);

  return (
    <FloatingPanelRoot>
      <EditorLogoMenuTrigger />
      <FloatingPanelContent
        placement={side === "right" ? "right-start" : "bottom"}
        showTitle={false}
        className="p-0"
      >
        <EditorLogoMenuContent
          query={query}
          copy={copy}
          navigate={navigate}
          settingsScreen={settingsScreen}
          showFile={showFile}
          showEdit={showEdit}
          showView={showView}
          showSettings={showSettings}
          showNotifications={showNotifications}
          showHelp={showHelp}
          onQueryChange={setQuery}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
