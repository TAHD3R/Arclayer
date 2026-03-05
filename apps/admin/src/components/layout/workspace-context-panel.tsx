import { AdminWorkspaceSwitcher } from "@/components/layout/admin-workspace-switcher";
import { cn } from "@celestial/lib/utils";

export function WorkspaceContextPanel(props: { className?: string }) {
  return (
    <div className={cn("min-w-0 w-full", props.className)}>
      <AdminWorkspaceSwitcher />
    </div>
  );
}
