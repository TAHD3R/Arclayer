import { beforeEach, describe, expect, it } from "vitest";

import { useFavoritesStore } from "@/stores/use-favorites-store";

describe("useFavoritesStore folders", () => {
  beforeEach(() => {
    useFavoritesStore.setState({
      paths: [],
      items: [],
      sectionExpanded: false,
    });
  });

  it("adds and renames folders", () => {
    const folderId = useFavoritesStore.getState().addFolder("New folder");

    expect(useFavoritesStore.getState().items).toEqual([
      expect.objectContaining({
        id: folderId,
        type: "folder",
        name: "New folder",
        expanded: true,
      }),
    ]);

    useFavoritesStore.getState().renameFolder(folderId, "Pinned");

    expect(useFavoritesStore.getState().items).toEqual([
      expect.objectContaining({
        id: folderId,
        type: "folder",
        name: "Pinned",
      }),
    ]);
  });

  it("deletes folders and lifts their children to the parent level", () => {
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets"],
      items: [
        {
          id: "folder:launches",
          type: "folder",
          name: "Launches",
          expanded: true,
          children: [{ id: "item:/w/ws-1/assets", type: "item", path: "/w/ws-1/assets" }],
        },
      ],
      sectionExpanded: false,
    });

    useFavoritesStore.getState().deleteFolder("folder:launches");

    expect(useFavoritesStore.getState().items).toEqual([
      {
        id: "item:/w/ws-1/assets",
        type: "item",
        path: "/w/ws-1/assets",
      },
    ]);
    expect(useFavoritesStore.getState().paths).toEqual(["/w/ws-1/assets"]);
  });

  it("moves favorites into folders and preserves flattened path compatibility", () => {
    useFavoritesStore.setState({
      paths: ["/w/ws-1/assets", "/w/ws-1/team/members"],
      items: [
        { id: "item:/w/ws-1/assets", type: "item", path: "/w/ws-1/assets" },
        { id: "item:/w/ws-1/team/members", type: "item", path: "/w/ws-1/team/members" },
      ],
      sectionExpanded: false,
    });

    const folderId = useFavoritesStore.getState().addFolder("Pinned");
    useFavoritesStore.getState().move("item:/w/ws-1/assets", folderId);

    expect(useFavoritesStore.getState().items).toEqual([
      {
        id: "item:/w/ws-1/team/members",
        type: "item",
        path: "/w/ws-1/team/members",
      },
      expect.objectContaining({
        id: folderId,
        type: "folder",
        children: [
          {
            id: "item:/w/ws-1/assets",
            type: "item",
            path: "/w/ws-1/assets",
          },
        ],
      }),
    ]);
    expect(useFavoritesStore.getState().paths).toEqual(["/w/ws-1/team/members", "/w/ws-1/assets"]);
  });
});
