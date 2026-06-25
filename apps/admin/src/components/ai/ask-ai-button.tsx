import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { Button } from "@arclayer/ui/button";

export function AskAiButton({ labelKey = "ai:AI_CHAT_ASK" }: { labelKey?: string }) {
  const { t } = useTranslation(["ai", "common"]);
  const drawerOpen = useAiChatStore((s) => s.drawerOpen);
  const toggleDrawer = useAiChatStore((s) => s.toggleDrawer);
  const label = t(labelKey);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      tapScale={1}
      aria-label={label}
      aria-pressed={drawerOpen}
      className="text-callout font-semibold"
      onClick={toggleDrawer}
    >
      <Sparkles className="size-4 shrink-0 opacity-80" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
