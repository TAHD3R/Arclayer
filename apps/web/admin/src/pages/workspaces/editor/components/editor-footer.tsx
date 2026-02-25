import { useTranslation } from "react-i18next";

import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-500",
  disconnected: "bg-red-500",
};

const STATUS_KEYS: Record<string, { key: string; defaultValue: string }> = {
  connected: { key: "EDITOR_SHELL_BRIDGE_CONNECTED", defaultValue: "Connected" },
  connecting: { key: "EDITOR_SHELL_BRIDGE_CONNECTING", defaultValue: "Connecting..." },
  disconnected: { key: "EDITOR_SHELL_BRIDGE_DISCONNECTED", defaultValue: "Disconnected" },
};

export function EditorFooter() {
  const { t } = useTranslation(["content_pages"]);
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const layerTree = useEditorStore((s) => s.layerTree);

  const statusInfo = STATUS_KEYS[bridgeStatus] ?? STATUS_KEYS.disconnected;
  const dotColor = STATUS_COLORS[bridgeStatus] ?? STATUS_COLORS.disconnected;

  // Build breadcrumb from layerTree for selected block
  const breadcrumb = buildBreadcrumb(layerTree, selectedBlockId);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-3 text-caption text-label-secondary">
      {/* Left: Bridge status */}
      <div className="flex items-center gap-1.5">
        <span className={`inline-block size-2 rounded-full ${dotColor}`} />
        <span>
          {t(`content_pages:${statusInfo.key}`, { defaultValue: statusInfo.defaultValue })}
        </span>
      </div>

      {/* Center: Breadcrumb */}
      {breadcrumb.length > 0 ? (
        <div className="flex items-center gap-1">
          {breadcrumb.map((segment, i) => (
            <span key={segment.id}>
              {i > 0 ? <span className="mx-0.5 text-label-secondary/50">/</span> : null}
              <span>{segment.label || segment.type}</span>
            </span>
          ))}
        </div>
      ) : null}
    </footer>
  );
}

// Recursively find the path from root to the selected block
function buildBreadcrumb(
  nodes: { id: string; type: string; label: string; children: typeof nodes }[],
  targetId: string | null,
): { id: string; type: string; label: string }[] {
  if (!targetId) return [];

  for (const node of nodes) {
    if (node.id === targetId) {
      return [{ id: node.id, type: node.type, label: node.label }];
    }
    const childPath = buildBreadcrumb(node.children, targetId);
    if (childPath.length > 0) {
      return [{ id: node.id, type: node.type, label: node.label }, ...childPath];
    }
  }
  return [];
}
