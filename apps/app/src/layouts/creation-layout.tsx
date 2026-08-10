import {
  useState,
  createContext,
  useContext,
  type CSSProperties,
  type PropsWithChildren,
} from "react";

import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import DotField from "@/components/DotField";
import { cn } from "@arclayer/lib/utils";
import { Sidebar, SidebarContent, SidebarFooter, SidebarProvider } from "@arclayer/ui/sidebar";

const EDITOR_SIDEBAR_WIDTH_PX = 56;

interface CreationSidebarContextValue {
  slot: HTMLElement | null;
  registerSlot: (element: HTMLDivElement | null) => void;
}

const CreationSidebarContext = createContext<CreationSidebarContextValue>({
  slot: null,
  registerSlot: () => undefined,
});

export function useCreationSidebarToolsSlot() {
  return useContext(CreationSidebarContext).slot;
}

export function EditorSidebar() {
  const { registerSlot } = useContext(CreationSidebarContext);

  return (
    <Sidebar
      collapsible="icon"
      enableHoverPreview={false}
      animateOnHover={false}
      className="!static !inset-auto !z-0 !flex !h-full !w-(--sidebar-width-icon) !border-0 !bg-transparent [&_[data-sidebar=sidebar]]:!bg-transparent"
    >
      <SidebarContent className="px-2 py-2">
        <div
          ref={registerSlot}
          data-creation-sidebar-tools-slot
          className={cn("flex min-h-0 w-full flex-1 flex-col justify-center")}
        />
      </SidebarContent>
      <SidebarFooter className="mt-auto p-0">
        <AdminAccountMenu variant="sidebar" />
      </SidebarFooter>
    </Sidebar>
  );
}

export function CreationLayout({ children }: PropsWithChildren) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  return (
    <SidebarProvider
      open={false}
      defaultOpen={false}
      onOpenChange={() => undefined}
      style={
        {
          "--sidebar-width": `${EDITOR_SIDEBAR_WIDTH_PX}px`,
          "--sidebar-width-icon": `${EDITOR_SIDEBAR_WIDTH_PX}px`,
        } as CSSProperties
      }
      className="h-screen min-h-0 overflow-hidden"
    >
      <CreationSidebarContext.Provider value={{ slot: toolsSlot, registerSlot: setToolsSlot }}>
        <div className="relative flex h-screen min-h-0 w-full overflow-hidden bg-transparent">
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <DotField
              aria-hidden="true"
              dotRadius={1.5}
              dotSpacing={22}
              cursorRadius={200}
              cursorForce={0.1}
              bulgeOnly
              bulgeStrength={17}
              gradientFrom="rgba(148, 163, 184, 0.42)"
              gradientTo="rgba(100, 116, 139, 0.22)"
              className="opacity-100"
            />
          </div>
          <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </CreationSidebarContext.Provider>
    </SidebarProvider>
  );
}
