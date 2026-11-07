import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import type { Citation } from "@/lib/types";

interface ActiveTooltipData {
  id: string;
  citation: Citation;
  rect: DOMRect;
}

interface CitationTooltipContextValue {
  onBadgeMouseEnter: (el: HTMLElement, citation: Citation, id: string) => void;
  onBadgeMouseLeave: (id: string) => void;
  onBadgeFocus: (el: HTMLElement, citation: Citation, id: string) => void;
  onBadgeBlur: (id: string) => void;
  dismissTooltip: () => void;
  activeBadgeId: string | null;
}

const CitationTooltipContext = createContext<CitationTooltipContextValue | null>(null);

export const useCitationTooltip = () => {
  const ctx = useContext(CitationTooltipContext);
  if (!ctx) {
    // Graceful fallback if rendered outside provider
    return {
      onBadgeMouseEnter: () => {},
      onBadgeMouseLeave: () => {},
      onBadgeFocus: () => {},
      onBadgeBlur: () => {},
      dismissTooltip: () => {},
      activeBadgeId: null,
    };
  }
  return ctx;
};

export const CitationTooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchRef = useRef(false);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);

  const dismissTooltip = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setActiveTooltip(null);
    setTooltipPos(null);
  }, []);

  // Track touch usage to prevent tooltips on mobile/touch devices
  useEffect(() => {
    const handleTouchStart = () => {
      isTouchRef.current = true;
      dismissTooltip();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart, { capture: true });
    };
  }, [dismissTooltip]);

  // Dismiss on window/container scroll, resize, or Escape key
  useEffect(() => {
    if (!activeTooltip) return;

    const handleScrollOrResize = () => dismissTooltip();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissTooltip();
    };

    window.addEventListener("scroll", handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, { capture: true });
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTooltip, dismissTooltip]);

  // Compute position based on badge rect and measured tooltip dimensions
  const updatePosition = useCallback((rect: DOMRect, el: HTMLElement | null) => {
    const margin = 8;
    const gap = 6;
    const tooltipWidth = el ? el.offsetWidth : 180;
    const tooltipHeight = el ? el.offsetHeight : 28;

    // Horizontal centering relative to badge
    const badgeCenter = rect.left + rect.width / 2;
    let left = badgeCenter - tooltipWidth / 2;

    // Clamp horizontally to viewport bounds with 8px margin
    const maxLeft = window.innerWidth - tooltipWidth - margin;
    left = Math.max(margin, Math.min(maxLeft, left));

    // Vertical positioning: prefer above, flip below if insufficient clearance
    let top = rect.top - tooltipHeight - gap;
    if (top < margin) {
      top = rect.bottom + gap;
      // If flipping below overflows viewport bottom, clamp to bottom margin
      if (top + tooltipHeight > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - tooltipHeight - margin);
      }
    }

    setTooltipPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (activeTooltip) {
      updatePosition(activeTooltip.rect, tooltipElRef.current);
    }
  }, [activeTooltip, updatePosition]);

  const showForBadge = useCallback(
    (badgeEl: HTMLElement, citation: Citation, id: string) => {
      // Use getClientRects()[0] for wrapped elements, fallback to getBoundingClientRect()
      const clientRects = badgeEl.getClientRects();
      const rect = clientRects.length > 0 ? clientRects[0] : badgeEl.getBoundingClientRect();
      setActiveTooltip({ id, citation, rect });
      updatePosition(rect, tooltipElRef.current);
    },
    [updatePosition]
  );

  const onBadgeMouseEnter = useCallback(
    (el: HTMLElement, citation: Citation, id: string) => {
      if (isTouchRef.current) return;
      // Check if primary pointer supports hover
      if (window.matchMedia && !window.matchMedia("(hover: hover)").matches) return;

      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }

      hoverTimerRef.current = setTimeout(() => {
        showForBadge(el, citation, id);
      }, 120);
    },
    [showForBadge]
  );

  const onBadgeMouseLeave = useCallback(
    (id: string) => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (activeTooltip?.id === id) {
        dismissTooltip();
      }
    },
    [activeTooltip?.id, dismissTooltip]
  );

  const onBadgeFocus = useCallback(
    (el: HTMLElement, citation: Citation, id: string) => {
      if (isTouchRef.current) return;
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      showForBadge(el, citation, id);
    },
    [showForBadge]
  );

  const onBadgeBlur = useCallback(
    (id: string) => {
      if (activeTooltip?.id === id) {
        dismissTooltip();
      }
    },
    [activeTooltip?.id, dismissTooltip]
  );

  const meta = activeTooltip?.citation.citation_metadata || {};
  const ticker = meta.ticker || "SEC";
  const fy = meta.fiscal_year ? `FY${meta.fiscal_year}` : "";
  const rawSection = meta.section_name || meta.section;
  const section = typeof rawSection === "string" ? rawSection : null;

  return (
    <CitationTooltipContext.Provider
      value={{
        onBadgeMouseEnter,
        onBadgeMouseLeave,
        onBadgeFocus,
        onBadgeBlur,
        dismissTooltip,
        activeBadgeId: activeTooltip?.id ?? null,
      }}
    >
      {children}

      {/* Render exactly ONE portal tooltip into document.body only when active */}
      {activeTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="citation-tooltip"
            role="tooltip"
            ref={(node) => {
              tooltipElRef.current = node;
              if (node && activeTooltip && !tooltipPos) {
                updatePosition(activeTooltip.rect, node);
              }
            }}
            style={{
              position: "fixed",
              top: tooltipPos ? `${tooltipPos.top}px` : "-9999px",
              left: tooltipPos ? `${tooltipPos.left}px` : "-9999px",
              pointerEvents: "none",
              zIndex: 9999,
            }}
            className="px-2.5 py-1 rounded-md bg-surface-900 border border-surface-750 text-[11px] text-slate-200 shadow-2xl whitespace-nowrap flex items-center gap-1.5 font-mono select-none transition-opacity duration-150 ease-out animate-in fade-in"
          >
            <span className="font-bold text-accent">{ticker}</span>
            {fy && <span className="text-slate-300 font-medium">{fy}</span>}
            {section && (
              <span className="text-slate-400 max-w-[220px] truncate">
                • {String(section)}
              </span>
            )}
          </div>,
          document.body
        )}
    </CitationTooltipContext.Provider>
  );
};
