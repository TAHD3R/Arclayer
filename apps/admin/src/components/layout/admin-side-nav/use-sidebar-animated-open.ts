import { useEffect, useRef, useState } from "react";

import { useSidebar } from "@arclayer/ui/sidebar";

export function useSidebarAnimatedOpen(logicalOpen: boolean) {
  const { state: sidebarState, layoutState, hoverOpen, isMobile, open } = useSidebar();
  const [visibleOpen, setVisibleOpen] = useState(logicalOpen);
  const previousLogicalOpenRef = useRef(logicalOpen);

  useEffect(() => {
    const wasLogicalOpen = previousLogicalOpenRef.current;
    previousLogicalOpenRef.current = logicalOpen;
    const isVisualClosingPhase =
      !isMobile &&
      !open &&
      !hoverOpen &&
      sidebarState === "expanded" &&
      layoutState === "collapsed";

    if (logicalOpen) {
      setVisibleOpen(!isVisualClosingPhase);
      return;
    }

    if (wasLogicalOpen && (sidebarState === "expanded" || isVisualClosingPhase)) {
      setVisibleOpen(false);
      return;
    }

    setVisibleOpen(false);
  }, [hoverOpen, isMobile, layoutState, logicalOpen, open, sidebarState]);

  return visibleOpen;
}
