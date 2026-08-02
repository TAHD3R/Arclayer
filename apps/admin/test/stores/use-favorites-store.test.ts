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

  it("expands the favorites section for a new store by default", () => {
    expect(useFavoritesStore.getInitialState().sectionExpanded).toBe(true);
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
      paths: ["/projects/project-1/assets"],
      items: [
        {
          id: "folder:launches",
          type: "folder",
          name: "Launches",
          expanded: true,
          children: [
            {
              id: "item:/projects/project-1/assets",
              type: "item",
              path: "/projects/project-1/assets",
            },
          ],
        },
      ],
      sectionExpanded: false,
    });

    useFavoritesStore.getState().deleteFolder("folder:launches");

    expect(useFavoritesStore.getState().items).toEqual([
      {
        id: "item:/projects/project-1/assets",
        type: "item",
        path: "/projects/project-1/assets",
      },
    ]);
    expect(useFavoritesStore.getState().paths).toEqual(["/projects/project-1/assets"]);
  });

  it("moves canonical favorites into folders and preserves flattened paths", () => {
    useFavoritesStore.setState({
      paths: ["/projects/project-1/assets", "/projects/project-1/content/library"],
      items: [
        {
          id: "item:/projects/project-1/assets",
          type: "item",
          path: "/projects/project-1/assets",
        },
        {
          id: "item:/projects/project-1/content/library",
          type: "item",
          path: "/projects/project-1/content/library",
        },
      ],
      sectionExpanded: false,
    });

    const folderId = useFavoritesStore.getState().addFolder("Pinned");
    useFavoritesStore.getState().move("item:/projects/project-1/assets", folderId);

    expect(useFavoritesStore.getState().items).toEqual([
      {
        id: "item:/projects/project-1/content/library",
        type: "item",
        path: "/projects/project-1/content/library",
      },
      expect.objectContaining({
        id: folderId,
        type: "folder",
        children: [
          {
            id: "item:/projects/project-1/assets",
            type: "item",
            path: "/projects/project-1/assets",
          },
        ],
      }),
    ]);
    expect(useFavoritesStore.getState().paths).toEqual([
      "/projects/project-1/content/library",
      "/projects/project-1/assets",
    ]);
  });
});
