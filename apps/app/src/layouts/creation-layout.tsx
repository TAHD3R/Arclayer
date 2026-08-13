import {
  useState,
  createContext,
  useContext,
  type CSSProperties,
  type PropsWithChildren,
} from "react";

import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import DotField from "@/components/DotField";
import { AIDrawerOverlay } from "@/components/ai/ai-drawer-overlay";
import { ArclayerAssistantScope } from "@/components/ai/arclayer-assistant-scope";
import { cn } from "@arclayer/lib/utils";
import { Sidebar, SidebarContent, SidebarFooter, SidebarProvider } from "@arclayer/ui/sidebar";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

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
          className={cn("flex min-h-0 w-full flex-1 flex-col justify-start")}
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
  const drawerOpen = useAiChatStore((state) => state.drawerOpen);

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
        <ArclayerAssistantScope>
          {(assistantState) => (
            <div
              className={cn(
                "relative flex h-screen min-h-0 w-full overflow-hidden bg-transparent transition-colors duration-[250ms]",
                drawerOpen && "min-[769px]:bg-muted/70",
              )}
            >
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
              <div
                className={cn(
                  "relative z-10 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                  drawerOpen &&
                    "min-[769px]:mx-6 min-[769px]:my-4 min-[769px]:rounded-3xl min-[769px]:border min-[769px]:border-border min-[769px]:bg-background",
                )}
              >
                {children}
              </div>
              <AIDrawerOverlay widthPx={384} assistantState={assistantState} />
            </div>
          )}
        </ArclayerAssistantScope>
      </CreationSidebarContext.Provider>
    </SidebarProvider>
  );
}
