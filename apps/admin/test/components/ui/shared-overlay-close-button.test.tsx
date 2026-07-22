import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("shared overlay close button", () => {
  it("uses the shared ghost button surface inside DialogContent", () => {
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog</DialogTitle>
            <DialogDescription>Body</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("data-variant", "ghost");
    expect(closeButton).toHaveAttribute("data-size", "icon-sm");
    expect(closeButton).toHaveClass("absolute", "right-4", "top-4", "shrink-0");
  });

  it("uses the shared ghost button surface inside AlertDialogContent", () => {
    render(
      <AlertDialog open onOpenChange={vi.fn()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alert</AlertDialogTitle>
            <AlertDialogDescription>Body</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    const content = closeButton.closest("[data-slot='alert-dialog-content']");
    const overlay = document.querySelector("[data-slot='alert-dialog-overlay']");
    expect(screen.getByText("Alert")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(content).toHaveClass("left-1/2", "top-1/2");
    expect(content).not.toHaveClass("translate-x-[-50%]", "translate-y-[-50%]");
    expect(overlay).toHaveClass("backdrop-blur-xs");
    expect(closeButton).toHaveAttribute("data-variant", "ghost");
    expect(closeButton).toHaveAttribute("data-size", "icon-sm");
    expect(closeButton).toHaveClass("absolute", "right-4", "top-4", "shrink-0");
  });

  it("uses the shared ghost button surface inside DrawerContent", () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer</DrawerTitle>
            <DrawerDescription>Body</DrawerDescription>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("data-variant", "ghost");
    expect(closeButton).toHaveAttribute("data-size", "icon-sm");
    expect(closeButton).toHaveClass("absolute", "right-4", "top-4", "shrink-0");
  });
});
