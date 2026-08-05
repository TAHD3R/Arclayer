import { useEffect, useRef, useState } from "react";

import { useSidebar } from "@arclayer/ui/sidebar";

export function useSidebarAnimatedOpen(logicalOpen: boolean) {
  const { layoutState, motionPhase, hoverOpen, isMobile, open } = useSidebar();
  const [visibleOpen, setVisibleOpen] = useState(logicalOpen);
  const previousLogicalOpenRef = useRef(logicalOpen);

  useEffect(() => {
    const wasLogicalOpen = previousLogicalOpenRef.current;
    previousLogicalOpenRef.current = logicalOpen;
    const isCollapsedSidebar = !isMobile && !open && !hoverOpen && layoutState === "collapsed";
    const isVisualClosingPhase = isCollapsedSidebar && motionPhase === "collapsing";

    if (logicalOpen) {
      setVisibleOpen(!isCollapsedSidebar);
      return;
    }

    if (wasLogicalOpen && (open || hoverOpen || isVisualClosingPhase)) {
      setVisibleOpen(false);
      return;
    }

    setVisibleOpen(false);
  }, [hoverOpen, isMobile, layoutState, logicalOpen, motionPhase, open]);

  return visibleOpen;
}
