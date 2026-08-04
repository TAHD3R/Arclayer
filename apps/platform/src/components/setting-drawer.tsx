import type { ReactNode } from "react";

import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export function SettingDrawer({
  children,
  description,
  footer,
  onOpenChange,
  open,
  title,
}: Readonly<{
  children: ReactNode;
  description: ReactNode;
  footer: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
}>) {
  return (
    <Drawer direction="right" handleOnly onOpenChange={onOpenChange} open={open}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription asChild>
            <div>{description}</div>
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>{children}</DrawerBody>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
