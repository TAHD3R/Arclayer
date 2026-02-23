import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import { normalizePathname } from "@celestial/site-editor-bridge";

interface EditorHostToolbarProps {
  overlayMode: EditorOverlayMode;
  lastPingRttMs: number | null;
  lastPingError: string | null;
  previewToken: string;
  previewTokenError: string | null;
  selectedBlockId: string | null;
  pathname: string;
  routeResolveError: string | null;
  activeEntrySlug: string | null;
  lastPresence: {
    pathname: string;
    overlayMode: EditorOverlayMode;
    selectedBlockId: string | null;
    hasDraftOverride: boolean;
    updatedAtMs: number;
  } | null;
  saveStatus: "idle" | "saving" | "error";
  lastSave: { pathname: string; revision: number; savedAtMs: number } | null;
  saveError: string | null;
  entrySaveStatus: "idle" | "saving" | "error";
  lastEntrySave: { slug: string; entryId: string; revision: number; savedAtMs: number } | null;
  entrySaveError: string | null;
  onSetOverlayMode: (mode: EditorOverlayMode) => void;
  onPing: () => void;
  onResetDraft: () => void;
  onPushDraft1: () => void;
  onSelectBlock: (blockId: string | null) => void;
  onSetPathname: (pathname: string) => void;
  onSaveEntryDraft: () => void;
  onPublishEntry: () => void;
}

export function EditorHostToolbar(props: EditorHostToolbarProps) {
  return (
    <div className="portal-editor-host-toolbar">
      <span className="portal-editor-host-meta">
        Overlay: <code>{props.overlayMode}</code>
      </span>
      <span className="portal-editor-host-meta">
        Ping:{" "}
        <code>
          {props.lastPingRttMs !== null
            ? `${props.lastPingRttMs}ms`
            : props.lastPingError
              ? "error"
              : "n/a"}
        </code>
      </span>
      <span className="portal-editor-host-meta">
        Token: <code>{props.previewToken ? `${props.previewToken.slice(0, 6)}...` : "n/a"}</code>
      </span>
      {props.previewTokenError ? (
        <span className="portal-editor-host-meta">
          Token error: <code>{props.previewTokenError}</code>
        </span>
      ) : null}
      {props.lastPingError ? (
        <span className="portal-editor-host-meta">
          Ping error: <code>{props.lastPingError}</code>
        </span>
      ) : null}
      <button type="button" onClick={() => props.onSetOverlayMode("off")}>
        Overlay Off
      </button>
      <button type="button" onClick={() => props.onSetOverlayMode("inspect")}>
        Inspect
      </button>
      <button type="button" onClick={() => props.onSetOverlayMode("edit")}>
        Edit
      </button>
      <button type="button" onClick={props.onPing}>
        Ping
      </button>
      <span className="portal-editor-host-sep" aria-hidden="true" />
      <button type="button" onClick={props.onResetDraft}>
        Reset Draft
      </button>
      <button type="button" onClick={props.onPushDraft1}>
        Push Draft #1
      </button>
      <button type="button" onClick={() => props.onSelectBlock("b1-h1")}>
        Select b1-h1
      </button>
      <button type="button" onClick={() => props.onSelectBlock("b1-p1")}>
        Select b1-p1
      </button>
      <button type="button" onClick={() => props.onSelectBlock(null)}>
        Clear Selection
      </button>
      <span className="portal-editor-host-meta">
        Selected: <code>{props.selectedBlockId ?? "null"}</code>
      </span>
      <span className="portal-editor-host-meta">
        Path: <code>{normalizePathname(props.pathname)}</code>
      </span>
      {props.routeResolveError ? (
        <span className="portal-editor-host-meta">
          Resolve error: <code>{props.routeResolveError}</code>
        </span>
      ) : null}
      <span className="portal-editor-host-meta">
        Entry slug: <code>{props.activeEntrySlug ?? "n/a"}</code>
      </span>
      {props.lastPresence ? (
        <span className="portal-editor-host-meta">
          Presence: <code>{props.lastPresence.pathname}</code>{" "}
          <code>{String(props.lastPresence.overlayMode)}</code>{" "}
          <code>{props.lastPresence.selectedBlockId ?? "null"}</code>{" "}
          <code>{props.lastPresence.hasDraftOverride ? "draft" : "base"}</code>
        </span>
      ) : null}
      <span className="portal-editor-host-meta">
        Save:{" "}
        <code>
          {props.saveStatus === "saving"
            ? "saving"
            : props.saveStatus === "error"
              ? "error"
              : props.lastSave
                ? `rev ${props.lastSave.revision}`
                : "n/a"}
        </code>
      </span>
      {props.saveError ? (
        <span className="portal-editor-host-meta">
          Save error: <code>{props.saveError}</code>
        </span>
      ) : null}
      <span className="portal-editor-host-meta">
        Entry(world):{" "}
        <code>
          {props.entrySaveStatus === "saving"
            ? "saving"
            : props.entrySaveStatus === "error"
              ? "error"
              : props.lastEntrySave
                ? `rev ${props.lastEntrySave.revision}`
                : "n/a"}
        </code>
      </span>
      {props.entrySaveError ? (
        <span className="portal-editor-host-meta">
          Entry error: <code>{props.entrySaveError}</code>
        </span>
      ) : null}
      <span className="portal-editor-host-sep" aria-hidden="true" />
      <button type="button" onClick={() => props.onSetPathname("/")}>
        Go /
      </button>
      <button type="button" onClick={() => props.onSetPathname("/about")}>
        Go /about
      </button>
      <button type="button" onClick={() => props.onSetPathname("/blog/hello")}>
        Go /blog/hello
      </button>
      <button type="button" onClick={() => props.onSetPathname("/blog/world")}>
        Go /blog/world
      </button>
      <button type="button" onClick={() => props.onSetPathname("/old-about")}>
        Go /old-about
      </button>
      <span className="portal-editor-host-sep" aria-hidden="true" />
      <button type="button" onClick={props.onSaveEntryDraft} disabled={!props.activeEntrySlug}>
        Save Entry({props.activeEntrySlug ?? "n/a"})
      </button>
      <button type="button" onClick={props.onPublishEntry} disabled={!props.activeEntrySlug}>
        Publish Entry({props.activeEntrySlug ?? "n/a"})
      </button>
    </div>
  );
}
