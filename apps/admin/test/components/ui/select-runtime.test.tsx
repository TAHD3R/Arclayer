import * as React from "react";
import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetsFilterPopover } from "@/pages/workspaces/assets/components/assets-filter-popover";
import { AssetsViewHeader } from "@/pages/workspaces/assets/components/assets-view-header";
import { DeleteAssetFolderDialog } from "@/pages/workspaces/assets/components/delete-asset-folder-dialog";
import { MoveAssetsToFolderModal } from "@/pages/workspaces/assets/components/move-assets-to-folder-modal";
import { UpdateAssetsAccessDialog } from "@/pages/workspaces/assets/components/update-assets-access-dialog";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("shared Select", () => {
  it("opens inside a settings dialog under StrictMode without triggering an infinite update loop", async () => {
    const user = userEvent.setup();
    expect(() =>
      render(
        <StrictMode>
          <SettingDialog open onOpenChange={() => undefined} title="Edit asset access">
            <Select value="one" onValueChange={() => undefined}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="one">One</SelectItem>
                <SelectItem value="two">Two</SelectItem>
              </SelectContent>
            </Select>
          </SettingDialog>
        </StrictMode>,
      ),
    ).not.toThrow();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      const dropdown = document.querySelector("[data-slot='select-content']");
      const overlayRoot = document.querySelector("[data-overlay-root='dialog']");

      expect(dropdown).not.toBeNull();
      expect(overlayRoot).not.toBeNull();
      expect(overlayRoot?.contains(dropdown ?? null)).toBe(true);
    });
  });

  it("renders assets access dialog under StrictMode without hitting a nested update loop", () => {
    expect(() =>
      render(
        <StrictMode>
          <UpdateAssetsAccessDialog
            open
            onOpenChange={() => undefined}
            mode="single"
            currentVisibility="public"
            currentPurpose="library"
            currentIndexable
            onConfirm={() => undefined}
          />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("renders assets move dialog under StrictMode without hitting a nested update loop", () => {
    expect(() =>
      render(
        <StrictMode>
          <MoveAssetsToFolderModal
            open
            onOpenChange={() => undefined}
            folders={[{ id: "folder-1", name: "Library" } as never]}
            assetCount={2}
            onMove={() => undefined}
          />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("renders assets delete-folder dialog under StrictMode without hitting a nested update loop", () => {
    expect(() =>
      render(
        <StrictMode>
          <DeleteAssetFolderDialog
            open
            onOpenChange={() => undefined}
            folder={{ id: "folder-1", name: "Library" } as never}
            folders={
              [
                { id: "folder-1", name: "Library" },
                { id: "folder-2", name: "Media", parentId: null },
              ] as never
            }
            onConfirm={() => Promise.resolve()}
          />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("opens a Select inside a popover without portaling back into the popover content box", async () => {
    const user = userEvent.setup();

    expect(() =>
      render(
        <StrictMode>
          <Popover open>
            <PopoverTrigger asChild>
              <button type="button">Filters</button>
            </PopoverTrigger>
            <PopoverContent>
              <Select value="newest" onValueChange={() => undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </PopoverContent>
          </Popover>
        </StrictMode>,
      ),
    ).not.toThrow();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      const dropdown = document.querySelector("[data-slot='select-content']");
      const overlayRoot = document.querySelector("[data-slot='popover-content']");

      expect(dropdown).not.toBeNull();
      expect(overlayRoot).not.toBeNull();
      expect(overlayRoot?.contains(dropdown ?? null)).toBe(false);
      expect(document.body.contains(dropdown)).toBe(true);
    });
  });

  it("keeps Select content above expandable screens", async () => {
    const user = userEvent.setup();

    render(
      <StrictMode>
        <ExpandableScreen defaultExpanded>
          <ExpandableScreenContent>
            <div className="p-6">
              <Select value="one" onValueChange={() => undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick one" />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="one">One</SelectItem>
                  <SelectItem value="two">Two</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </ExpandableScreenContent>
        </ExpandableScreen>
      </StrictMode>,
    );

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => {
      const dropdown = document.querySelector("[data-slot='select-content']");
      expect(dropdown).not.toBeNull();
      expect(dropdown).toHaveClass("z-[2400]");
      expect(document.body.contains(dropdown)).toBe(true);
    });
  });

  it("stays stable when parent rerenders repeatedly under StrictMode", () => {
    function StressHarness() {
      const [tick, setTick] = React.useState(0);

      React.useEffect(() => {
        if (tick >= 8) return;
        setTick((current) => current + 1);
      }, [tick]);

      return (
        <SettingDialog open onOpenChange={() => undefined} title={`tick-${tick}`}>
          <Select value="one" onValueChange={() => undefined}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="one">One</SelectItem>
              <SelectItem value="two">Two</SelectItem>
            </SelectContent>
          </Select>
        </SettingDialog>
      );
    }

    expect(() =>
      render(
        <StrictMode>
          <StressHarness />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("keeps the first field unfocused when a settings dialog opens", async () => {
    render(
      <SettingDialog open onOpenChange={() => undefined} title="Create workspace">
        <input aria-label="Workspace name" />
      </SettingDialog>,
    );

    const input = screen.getByLabelText("Workspace name");

    await waitFor(() => {
      expect(document.activeElement).not.toBe(input);
    });
  });

  it("supports searchable popovers without forcing focus onto the first field", async () => {
    const user = userEvent.setup();

    function PopoverHarness() {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button">Members</button>
          </PopoverTrigger>
          <PopoverContent
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <input aria-label="Search members" />
          </PopoverContent>
        </Popover>
      );
    }

    render(<PopoverHarness />);

    const trigger = screen.getByRole("button", { name: "Members" });
    await user.click(trigger);

    const input = await screen.findByLabelText("Search members");
    await waitFor(() => {
      expect(document.activeElement).not.toBe(input);
    });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByLabelText("Search members")).not.toBeInTheDocument();
    });
  });

  it("renders the assets filter toolbar under StrictMode without hitting a nested update loop", () => {
    expect(() =>
      render(
        <StrictMode>
          <AssetsFilterPopover
            value={{}}
            onChange={() => undefined}
            ordering="-created_at"
            onOrderingChange={() => undefined}
            tags={[]}
            tagsLoading={false}
          />
        </StrictMode>,
      ),
    ).not.toThrow();
  });

  it("renders the assets page header under StrictMode without hitting a nested update loop", () => {
    expect(() =>
      render(
        <StrictMode>
          <AssetsViewHeader
            t={(key) => key}
            viewMode="card"
            onViewModeChange={() => undefined}
            setFilters={() => undefined}
            searchInput=""
            setSearchInput={() => undefined}
            filters={{}}
            ordering="-created_at"
            setOrdering={() => undefined}
            tags={[]}
            tagsLoading={false}
          />
        </StrictMode>,
      ),
    ).not.toThrow();
  });
});
