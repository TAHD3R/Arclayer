import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import "./drift-wall.css";

export type DriftWallItem = {
  image: string;
  title?: string;
};

export type DriftWallProps = {
  items?: readonly DriftWallItem[];
  columns?: number;
  tileWidth?: number;
  tileHeight?: number;
  gap?: number;
  radius?: number;
  tilt?: number;
  turn?: number;
  roll?: number;
  perspective?: number;
  depth?: number;
  speed?: number;
  direction?: "up" | "down";
  variance?: number;
  parallax?: number;
  pauseOnHover?: boolean;
  lift?: number;
  fade?: number;
  dim?: number;
  grayscale?: boolean;
  overlayColor?: string;
  className?: string;
  style?: CSSProperties;
};

type ColumnMeta = {
  copyHeight: number;
  copies: number;
};

const DEFAULT_ITEMS: readonly DriftWallItem[] = [
  "agency-report",
  "architecture-index",
  "city-events",
  "commerce-atelier",
  "editorial-studio",
  "hospitality-room",
  "real-estate-showcase",
  "saas-launch",
  "travel-journal",
  "workspace-hub",
  "modern-architecture",
  "creative-office",
  "bright-studio",
  "concrete-form",
  "coastal-light",
  "quiet-house",
].map((name) => ({ image: `/inspiration/${name}.jpg` }));

function columnFactor(index: number, variance: number) {
  const pseudo = ((index * 0.6180339887 + 0.35) % 1) * 2 - 1;
  return 1 + variance * pseudo;
}

function getReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function DriftWall({
  items = DEFAULT_ITEMS,
  columns = 5,
  tileWidth = 200,
  tileHeight = 132,
  gap = 18,
  radius = 14,
  tilt = 16,
  turn = -14,
  roll = 0,
  perspective = 1200,
  depth = 120,
  speed = 42,
  direction = "up",
  variance = 0.45,
  parallax = 0.6,
  pauseOnHover = false,
  lift = 64,
  fade = 0.6,
  dim = 0.55,
  grayscale = false,
  overlayColor = "#060010",
  className,
  style,
}: DriftWallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);
  const offsetsRef = useRef<number[]>([]);
  const velocitiesRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const pointerDampedRef = useRef({ x: 0, y: 0 });
  const wallHoveredRef = useRef(false);
  const [containerSize, setContainerSize] = useState({ width: 1440, height: 600 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(getReducedMotion());
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return;
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width || 1440,
        height: entry.contentRect.height || 600,
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const columnItems = useMemo(() => {
    const result: DriftWallItem[][] = Array.from({ length: columns }, () => []);
    items.forEach((item, index) => result[index % columns]?.push(item));
    return result.map((column) => (column.length > 0 ? column : items.slice(0, 1)));
  }, [columns, items]);

  const columnMeta = useMemo<ColumnMeta[]>(() => {
    const unit = tileHeight + gap;
    return columnItems.map((column) => {
      const copyHeight = Math.max(unit, column.length * unit);
      const copies = Math.max(2, Math.ceil((containerSize.height * 1.6) / copyHeight) + 1);
      return { copyHeight, copies };
    });
  }, [columnItems, containerSize.height, gap, tileHeight]);

  const planeScale = Math.max(1.18, (containerSize.width * 0.86) / (columns * (tileWidth + gap)));

  const baseVelocities = useMemo(() => {
    const directionSign = direction === "up" ? 1 : -1;
    return columnItems.map((_, index) => {
      const alternatingSign = index % 2 === 0 ? 1 : -1;
      return speed * columnFactor(index, variance) * directionSign * alternatingSign;
    });
  }, [columnItems, direction, speed, variance]);

  useEffect(() => {
    offsetsRef.current = columnMeta.map((meta, index) => meta.copyHeight * ((index * 0.37) % 1));
    velocitiesRef.current = columnItems.map(() => 0);
  }, [columnItems, columnMeta]);

  useEffect(() => {
    const plane = planeRef.current;
    if (!plane) return;
    const applyPlaneTransform = (pointerX: number, pointerY: number) => {
      plane.style.transform =
        `translate(-50%, -50%) scale(${planeScale}) rotateX(${tilt + pointerY}deg) ` +
        `rotateY(${turn + pointerX}deg) rotateZ(${roll}deg) translateZ(${-depth}px)`;
    };
    applyPlaneTransform(0, 0);

    const setTrackPositions = () => {
      trackRefs.current.forEach((track, index) => {
        const meta = columnMeta[index];
        if (track && meta)
          track.style.transform = `translate3d(0, ${-(offsetsRef.current[index] ?? 0)}px, 0)`;
      });
    };

    if (reduced) {
      setTrackPositions();
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTsRef.current === null) lastTsRef.current = timestamp;
      const delta = Math.min(0.05, Math.max(0, timestamp - lastTsRef.current) / 1000);
      lastTsRef.current = timestamp;
      const maxTilt = parallax * 8;
      const targetX = pointerRef.current.x * maxTilt;
      const targetY = -pointerRef.current.y * maxTilt;
      const damping = 1 - Math.exp(-delta / 0.12);
      pointerDampedRef.current.x += (targetX - pointerDampedRef.current.x) * damping;
      pointerDampedRef.current.y += (targetY - pointerDampedRef.current.y) * damping;
      applyPlaneTransform(pointerDampedRef.current.x, pointerDampedRef.current.y);
      columnMeta.forEach((meta, index) => {
        const target = pauseOnHover && wallHoveredRef.current ? 0 : (baseVelocities[index] ?? 0);
        const easing = 1 - Math.exp(-delta / 0.28);
        velocitiesRef.current[index] =
          (velocitiesRef.current[index] ?? 0) +
          (target - (velocitiesRef.current[index] ?? 0)) * easing;
        const next =
          ((offsetsRef.current[index] ?? 0) + velocitiesRef.current[index] * delta) %
          meta.copyHeight;
        offsetsRef.current[index] = (next + meta.copyHeight) % meta.copyHeight;
        const track = trackRefs.current[index];
        if (track) track.style.transform = `translate3d(0, ${-offsetsRef.current[index]}px, 0)`;
      });
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [
    baseVelocities,
    columnMeta,
    depth,
    parallax,
    pauseOnHover,
    planeScale,
    reduced,
    roll,
    tilt,
    turn,
  ]);

  const cssVars = {
    "--dw-tile-w": `${tileWidth}px`,
    "--dw-tile-h": `${tileHeight}px`,
    "--dw-gap": `${gap}px`,
    "--dw-radius": `${radius}px`,
    "--dw-dim": dim,
    "--dw-gray": grayscale ? 1 : 0,
    "--dw-lift": `${lift}px`,
    "--dw-overlay": overlayColor,
    "--dw-edge": `${Math.max(0, (1 - fade) * 100)}%`,
    perspective: `${perspective}px`,
    ...style,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      data-testid="drift-wall"
      aria-hidden="true"
      className={`drift-wall ${className ?? ""}`}
      style={cssVars}
      onPointerMove={(event) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || reduced || parallax <= 0) return;
        pointerRef.current = {
          x: (event.clientX - rect.left) / rect.width - 0.5,
          y: (event.clientY - rect.top) / rect.height - 0.5,
        };
      }}
      onPointerEnter={() => {
        wallHoveredRef.current = true;
      }}
      onPointerLeave={() => {
        wallHoveredRef.current = false;
        pointerRef.current = { x: 0, y: 0 };
      }}
    >
      <div ref={planeRef} className="drift-wall__plane">
        {columnItems.map((column, columnIndex) => {
          const meta = columnMeta[columnIndex];
          return (
            <div className="drift-wall__column" key={`column-${columnIndex}`}>
              <div
                className="drift-wall__track"
                ref={(element) => {
                  trackRefs.current[columnIndex] = element;
                }}
              >
                {Array.from({ length: meta.copies }).flatMap((_, copyIndex) =>
                  column.map((item, itemIndex) => (
                    <div
                      className="drift-wall__tile"
                      key={`${columnIndex}-${copyIndex}-${itemIndex}`}
                    >
                      <span className="drift-wall__inner">
                        <img
                          src={item.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                        <span className="drift-wall__overlay" />
                      </span>
                    </div>
                  )),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
